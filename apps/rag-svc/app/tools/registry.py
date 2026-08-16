"""The tool catalogue exposed to the generation model."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.core.config import Settings, get_settings
from app.core.logging import get_logger
from app.tools.base import Tool, ToolContext, ToolResult
from app.tools.platform_tools import (
    CalculateMortgageTool,
    CreateLeadTool,
    EscalateToHumanTool,
    GetPropertyDetailsTool,
    SearchListingsTool,
)
from app.tools.web_search import WebSearchTool

logger = get_logger("rag-svc.tools.registry")

#: Which tools each route is allowed to reach. Narrowing the menu per route
#: keeps the model focused and stops it web-searching a listings question.
ROUTE_TOOLS: dict[str, tuple[str, ...]] = {
    "smalltalk": (),
    "knowledge": ("search_listings", "get_property_details", "calculate_mortgage"),
    "listing_search": (
        "search_listings",
        "get_property_details",
        "calculate_mortgage",
        "create_lead",
    ),
    "web": ("web_search",),
    "handoff": ("escalate_to_human", "create_lead"),
}


@dataclass(slots=True)
class ToolRegistry:
    """Name → tool, with the per-route schema view the model receives."""

    tools: dict[str, Tool]

    def get(self, name: str) -> Tool | None:
        return self.tools.get(name)

    def names(self) -> list[str]:
        return sorted(self.tools)

    def schemas(self, route: str | None = None) -> list[dict[str, Any]]:
        """OpenAI `tools[]` for a route (all tools when `route` is None)."""
        allowed = ROUTE_TOOLS.get(route or "", None)
        selected = (
            self.tools.values()
            if allowed is None
            else [self.tools[name] for name in allowed if name in self.tools]
        )
        return [tool.schema() for tool in selected]

    async def invoke(
        self, name: str, arguments: dict[str, Any], context: ToolContext
    ) -> ToolResult:
        """Run a tool by name, containing an unknown-tool request as a result."""
        tool = self.tools.get(name)

        if tool is None:
            logger.warning("tool_unknown", tool=name, known=self.names())
            return ToolResult(
                name=name,
                ok=False,
                error=f"unknown tool '{name}' — available: {', '.join(self.names())}",
            )

        return await tool.invoke(arguments, context)

    def describe(self) -> dict[str, Any]:
        return {
            "count": len(self.tools),
            "tools": self.names(),
            "webSearchLive": getattr(self.tools.get("web_search"), "available", False),
        }


def build_tool_registry(settings: Settings | None = None) -> ToolRegistry:
    """Instantiate every tool for the current configuration."""
    cfg = settings or get_settings()

    tools: list[Tool] = [
        SearchListingsTool(cfg),
        GetPropertyDetailsTool(cfg),
        CalculateMortgageTool(cfg),
        CreateLeadTool(cfg),
        EscalateToHumanTool(cfg),
        WebSearchTool(cfg),
    ]

    registry = ToolRegistry(tools={tool.name: tool for tool in tools})
    logger.info("tools_ready", **registry.describe())
    return registry


__all__ = ["ROUTE_TOOLS", "ToolRegistry", "build_tool_registry"]
