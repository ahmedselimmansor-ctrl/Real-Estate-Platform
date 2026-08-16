"""Tools that call the other Nawy services (CONTRACT §1 internal URLs).

`search_listings` → search-svc, `get_property_details` → api-core,
`calculate_mortgage` → reports-svc, `create_lead` / `escalate_to_human` →
api-core. Each keeps its own short timeout: the chat stream must stay responsive
even when a backend is slow.
"""

from __future__ import annotations

from typing import Any

import httpx
from pydantic import BaseModel, Field

from app.core.config import Settings, get_settings
from app.core.logging import get_logger
from app.tools.base import Tool, ToolContext, ToolResult

logger = get_logger("rag-svc.tools.platform")

PROPERTY_TYPES = (
    "apartment", "villa", "townhouse", "twinhouse", "duplex", "penthouse",
    "studio", "chalet", "office", "retail", "clinic",
)


def _money(amount: Any) -> str:
    try:
        return f"EGP {int(amount):,}"
    except (TypeError, ValueError):
        return "price on request"


async def _get_json(url: str, *, params: dict | None = None, headers: dict | None = None,
                    timeout: float = 8.0) -> Any:
    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.get(url, params=params, headers=headers or {})
        response.raise_for_status()
        return response.json()


async def _post_json(url: str, payload: dict, *, headers: dict | None = None,
                     timeout: float = 8.0) -> Any:
    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(url, json=payload, headers=headers or {})
        response.raise_for_status()
        return response.json()


def _unwrap(body: Any) -> Any:
    """Strip the CONTRACT §4 envelope when present."""
    if isinstance(body, dict) and "data" in body and "success" in body:
        return body["data"]
    return body


# ------------------------------------------------------------ search_listings


class SearchListingsArgs(BaseModel):
    query: str | None = Field(
        default=None, description="Free-text search, e.g. 'sea view chalet'"
    )
    propertyType: str | None = Field(
        default=None, description=f"One of: {', '.join(PROPERTY_TYPES)}"
    )
    minPrice: int | None = Field(default=None, ge=0, description="Minimum price in EGP")
    maxPrice: int | None = Field(default=None, ge=0, description="Maximum price in EGP")
    bedrooms: int | None = Field(default=None, ge=0, le=20)
    areaName: str | None = Field(
        default=None, description="Area name, e.g. 'New Cairo', 'North Coast'"
    )
    compoundName: str | None = Field(default=None)
    limit: int = Field(default=5, ge=1, le=10)


class SearchListingsTool(Tool):
    name = "search_listings"
    description = (
        "Search live Nawy property listings by budget, bedrooms, area, compound or "
        "property type. Use whenever the user wants to see actual units for sale or rent."
    )
    args_model = SearchListingsArgs
    timeout = 10.0

    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()

    def _params(self, args: SearchListingsArgs) -> dict[str, Any]:
        params: dict[str, Any] = {"limit": args.limit, "page": 1}

        # `areaName`/`compoundName` land in `q` because search-svc filters by id;
        # the text query matches the denormalised names in the index.
        text = " ".join(
            part for part in (args.query, args.areaName, args.compoundName) if part
        ).strip()
        if text:
            params["q"] = text
        if args.propertyType in PROPERTY_TYPES:
            params["propertyType"] = args.propertyType
        if args.minPrice is not None:
            params["minPrice"] = args.minPrice
        if args.maxPrice is not None:
            params["maxPrice"] = args.maxPrice
        if args.bedrooms is not None:
            params["bedrooms"] = args.bedrooms
        return params

    async def _search(self, params: dict[str, Any]) -> list[dict[str, Any]]:
        body = await _get_json(
            f"{self._settings.search_svc_url}/api/search", params=params, timeout=self.timeout
        )
        payload = _unwrap(body) or {}
        results = payload.get("results", payload if isinstance(payload, list) else [])
        return results if isinstance(results, list) else []

    async def run(self, args: SearchListingsArgs, context: ToolContext) -> ToolResult:
        params = self._params(args)
        results = await self._search(params)

        # Nothing matched. A consultant would not stop there, so drop the
        # narrowest constraint and come back with the nearest thing we do have,
        # clearly labelled as a relaxation rather than a match.
        relaxed_note = ""
        if not results:
            for dropped, label in (
                ("maxPrice", "above your budget"),
                ("bedrooms", "with a different number of bedrooms"),
                ("propertyType", "of another property type"),
            ):
                if dropped not in params:
                    continue
                widened = {key: value for key, value in params.items() if key != dropped}
                results = await self._search(widened)
                if results:
                    relaxed_note = (
                        f"Nothing matched exactly. The closest available units are {label}: "
                    )
                    break

        if not results:
            return ToolResult(
                name=self.name,
                ok=True,
                summary=(
                    "No listings matched those criteria, and widening the search did not "
                    "surface anything either. A Nawy consultant can check upcoming releases."
                ),
                output={"results": [], "count": 0},
            )

        lines: list[str] = []
        sources: list[dict[str, Any]] = []

        for listing in results[: args.limit]:
            title = (listing.get("title") or {}).get("en") or listing.get("titleEn") or "Listing"
            specs = listing.get("specs") or {}
            price = listing.get("price")
            price_amount = price.get("amount") if isinstance(price, dict) else price
            slug = listing.get("slug", "")

            lines.append(
                f"{title}: {specs.get('bedrooms', '?')} bed, "
                f"{specs.get('areaSqm', '?')} m², {_money(price_amount)}, "
                f"{listing.get('compoundName') or (listing.get('compound') or {}).get('name', '')}, "
                f"{listing.get('areaName') or (listing.get('location') or {}).get('areaName', '')}"
            )
            sources.append(
                {
                    "type": "property",
                    "id": listing.get("id") or listing.get("propertyId"),
                    "title": title,
                    "url": f"{self._settings.frontend_url}/properties/{slug}",
                    "slug": slug,
                    "price": price_amount,
                    "image": listing.get("primaryImage"),
                    "snippet": lines[-1],
                }
            )

        header = relaxed_note or f"{len(lines)} matching listing(s): "
        return ToolResult(
            name=self.name,
            ok=True,
            summary=header.rstrip() + "\n" + "\n".join(f"- {line}" for line in lines),
            output={
                "results": results[: args.limit],
                "count": len(results),
                "relaxed": bool(relaxed_note),
            },
            sources=sources,
        )


# ------------------------------------------------------- get_property_details


class PropertyDetailsArgs(BaseModel):
    idOrSlug: str = Field(description="Listing UUID or slug, e.g. 'mivida-3br-apartment-nwy-1042'")


class GetPropertyDetailsTool(Tool):
    name = "get_property_details"
    description = (
        "Fetch the full record for one listing (specs, payment plan, amenities, "
        "compound and developer). Use when the user asks about a specific unit."
    )
    args_model = PropertyDetailsArgs
    timeout = 8.0

    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()

    async def run(self, args: PropertyDetailsArgs, context: ToolContext) -> ToolResult:
        body = await _get_json(
            f"{self._settings.api_core_url}/api/v1/properties/{args.idOrSlug}",
            timeout=self.timeout,
        )
        listing = _unwrap(body)

        if not listing:
            return ToolResult(
                name=self.name, ok=False, error=f"listing '{args.idOrSlug}' not found"
            )

        specs = listing.get("specs", {})
        plan = listing.get("paymentPlan", {})
        price = listing.get("price", {})
        title = (listing.get("title") or {}).get("en", "Listing")

        summary = (
            f"{title}: {specs.get('bedrooms')} bed / {specs.get('bathrooms')} bath, "
            f"{specs.get('areaSqm')} m², {_money(price.get('amount'))} "
            f"({_money(price.get('pricePerMeter'))}/m²), finishing "
            f"{listing.get('finishing')}, status {listing.get('status')}. "
            f"Payment: {plan.get('downPaymentPercent')}% down over "
            f"{plan.get('installmentYears')} years "
            f"(~{_money(plan.get('monthlyInstallment'))}/month), delivery "
            f"{plan.get('deliveryDate')}. "
            f"Compound {(listing.get('compound') or {}).get('name')}, developer "
            f"{(listing.get('developer') or {}).get('name')}. "
            f"Amenities: {', '.join(listing.get('amenities', [])[:8]) or 'n/a'}."
        )

        return ToolResult(
            name=self.name,
            ok=True,
            summary=summary,
            output=listing,
            sources=[
                {
                    "type": "property",
                    "id": listing.get("propertyId"),
                    "title": title,
                    "url": f"{self._settings.frontend_url}/properties/{listing.get('slug')}",
                    "slug": listing.get("slug"),
                    "price": price.get("amount"),
                    "image": next(
                        (
                            image.get("url")
                            for image in (listing.get("media") or {}).get("images", [])
                            if image.get("isPrimary")
                        ),
                        None,
                    ),
                    "snippet": summary[:300],
                }
            ],
        )


# ------------------------------------------------------- calculate_mortgage


class MortgageArgs(BaseModel):
    price: int = Field(gt=0, description="Property price in EGP")
    downPaymentPercent: float = Field(default=10, ge=0, le=100)
    years: int = Field(default=8, gt=0, le=30, description="Repayment period in years")
    annualRatePercent: float = Field(
        default=0, ge=0, le=100,
        description="Annual interest rate; 0 for a developer instalment plan",
    )


class CalculateMortgageTool(Tool):
    name = "calculate_mortgage"
    description = (
        "Calculate the monthly payment, total interest and total cost for a property "
        "purchase. Use when the user asks what a unit would cost per month."
    )
    args_model = MortgageArgs
    timeout = 8.0

    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()

    async def run(self, args: MortgageArgs, context: ToolContext) -> ToolResult:
        body = await _post_json(
            f"{self._settings.reports_svc_url}/api/reports/mortgage/calculate",
            {
                "price": args.price,
                "downPaymentPercent": args.downPaymentPercent,
                "years": args.years,
                "annualRatePercent": args.annualRatePercent,
            },
            timeout=self.timeout,
        )
        data = _unwrap(body) or {}
        # reports-svc nests the figures under `summary`; older shapes put them
        # at the top level. Read whichever is present rather than rendering
        # "about None per month".
        figures = data.get("summary") if isinstance(data.get("summary"), dict) else data

        monthly = figures.get("monthlyPayment") or figures.get("monthly_payment")
        principal = figures.get("principal")
        total_interest = figures.get("totalInterest") or figures.get("total_interest")

        summary = (
            f"On {_money(args.price)} with {args.downPaymentPercent}% down over "
            f"{args.years} years at {args.annualRatePercent}%: "
            f"finance {_money(principal)}, about {_money(monthly)} per month"
        )
        if total_interest:
            summary += f", total interest {_money(total_interest)}"
        summary += ". Indicative only."

        return ToolResult(name=self.name, ok=True, summary=summary, output=data)


# -------------------------------------------------------------- create_lead


class CreateLeadArgs(BaseModel):
    name: str = Field(min_length=2, max_length=160, description="The user's full name")
    phone: str = Field(min_length=7, max_length=32, description="Contact phone number")
    email: str | None = Field(default=None, max_length=320)
    propertyId: str | None = Field(default=None, description="Listing UUID, if about a unit")
    message: str | None = Field(default=None, max_length=2000)


class CreateLeadTool(Tool):
    name = "create_lead"
    description = (
        "Book a viewing or request a callback from a Nawy consultant. Only call this "
        "after the user has explicitly confirmed and given their own name and phone "
        "number — never invent contact details."
    )
    args_model = CreateLeadArgs
    timeout = 8.0
    requires_confirmation = True

    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()

    async def run(self, args: CreateLeadArgs, context: ToolContext) -> ToolResult:
        if not context.confirmed:
            return ToolResult(
                name=self.name,
                ok=False,
                error=(
                    "not confirmed — ask the user to confirm their name and phone "
                    "number before booking"
                ),
            )

        headers = {"content-type": "application/json"}
        if context.access_token:
            headers["authorization"] = f"Bearer {context.access_token}"

        body = await _post_json(
            f"{self._settings.api_core_url}/api/v1/leads",
            {
                "name": args.name,
                "phone": args.phone,
                "email": args.email,
                "propertyId": args.propertyId,
                "message": args.message or "Requested via the Nawy assistant.",
                "source": "chatbot",
            },
            headers=headers,
            timeout=self.timeout,
        )
        data = _unwrap(body) or {}

        return ToolResult(
            name=self.name,
            ok=True,
            summary=(
                f"Callback request recorded for {args.name} on {args.phone}. "
                "A Nawy consultant will be in touch."
            ),
            output=data,
        )


# ------------------------------------------------------- escalate_to_human


class EscalateArgs(BaseModel):
    reason: str = Field(
        max_length=500,
        description="Why a human is needed: contract, complaint, refund, legal, other",
    )
    summary: str | None = Field(
        default=None, max_length=2000, description="What the user needs, for the consultant"
    )


class EscalateToHumanTool(Tool):
    name = "escalate_to_human"
    description = (
        "Hand the conversation to a human consultant. Use for contracts, complaints, "
        "refunds, disputes, legal or tax questions, or when the user asks for a person."
    )
    args_model = EscalateArgs
    timeout = 5.0

    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()

    async def run(self, args: EscalateArgs, context: ToolContext) -> ToolResult:
        # Recorded on the thread rather than posted anywhere: creating a lead
        # needs contact details the user has not necessarily given yet.
        logger.info(
            "handoff_requested",
            thread_id=context.thread_id,
            user_id=context.user_id,
            reason=args.reason[:120],
        )

        contact_url = f"{self._settings.frontend_url}/contact"
        summary = (
            f"Handoff recorded ({args.reason}). Tell the user a Nawy consultant will "
            f"follow up, and that they can also reach the team at {contact_url}. "
            "Offer to take their name and phone number for a callback."
        )

        return ToolResult(
            name=self.name,
            ok=True,
            summary=summary,
            output={"escalated": True, "reason": args.reason, "contactUrl": contact_url},
        )


__all__ = [
    "CalculateMortgageTool",
    "CreateLeadTool",
    "EscalateToHumanTool",
    "GetPropertyDetailsTool",
    "SearchListingsTool",
]
