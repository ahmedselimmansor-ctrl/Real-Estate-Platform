/**
 * Bilingual listing copy. Titles and descriptions are composed from the unit's
 * own attributes (bedrooms, area, compound, finishing, payment plan, delivery,
 * status), so every sentence is factually true for that specific listing.
 *
 * Template selection uses the per-property rng, so the copy is deterministic.
 */
import {
  COMMERCIAL_TYPES,
  FINISHING_LABELS,
  PROPERTY_TYPE_LABELS,
} from './enums.mjs';
import {
  egp,
  egpAr,
  floorOrdinalAr,
  floorOrdinalEn,
  groupDigits,
  listAr,
  listEn,
  quarterLabelAr,
  quarterLabelEn,
} from './format.mjs';

const isCommercial = (type) => COMMERCIAL_TYPES.includes(type);

/** "3 Bedroom " / "" for studios and commercial units. */
function bedroomPrefixEn(type, bedrooms) {
  if (type === 'studio' || isCommercial(type)) return '';
  return `${bedrooms} Bedroom `;
}

/** " 3 غرف" / " غرفتين" / " غرفة واحدة" / "" */
function bedroomSuffixAr(type, bedrooms) {
  if (type === 'studio' || isCommercial(type)) return '';
  if (bedrooms === 1) return ' غرفة واحدة';
  if (bedrooms === 2) return ' غرفتين';
  return ` ${bedrooms} غرف`;
}

/** Arabic bedroom count with correct dual/plural forms. */
function bedroomsAr(count) {
  if (count === 1) return 'غرفة نوم واحدة';
  if (count === 2) return 'غرفتي نوم';
  return `${count} غرف نوم`;
}

/** Arabic bathroom count with correct dual/plural forms. */
function bathroomsAr(count) {
  if (count === 1) return 'حمام واحد';
  if (count === 2) return 'حمامين';
  return `${count} حمامات`;
}

const bedroomsEn = (count) => `${count} ${count === 1 ? 'bedroom' : 'bedrooms'}`;
const bathroomsEn = (count) => `${count} ${count === 1 ? 'bathroom' : 'bathrooms'}`;

/** "SODIC's" but "Ora Developers'" — no double s. */
const possessive = (name) => (name.endsWith('s') ? `${name}'` : `${name}'s`);

const parkingEn = (count) => `${count} ${count === 1 ? 'parking spot' : 'parking spots'}`;

function parkingAr(count) {
  if (count === 1) return 'مكان انتظار واحد';
  if (count === 2) return 'مكانين لانتظار السيارات';
  return `${count} أماكن لانتظار السيارات`;
}

export function buildTitle(ctx, rng) {
  const type = PROPERTY_TYPE_LABELS[ctx.propertyType];
  const finishing = FINISHING_LABELS[ctx.finishing];
  const prefixEn = bedroomPrefixEn(ctx.propertyType, ctx.bedrooms);
  const suffixAr = bedroomSuffixAr(ctx.propertyType, ctx.bedrooms);
  const variant = rng.int(0, 2);

  if (variant === 0) {
    return {
      en: `${prefixEn}${type.en} for Sale in ${ctx.compoundName}, ${ctx.areaName}`,
      ar: `${type.ar}${suffixAr} للبيع في ${ctx.compoundNameAr}، ${ctx.areaNameAr}`,
    };
  }
  if (variant === 1) {
    return {
      en: `${prefixEn}${type.en} ${ctx.areaSqm} m² in ${ctx.compoundName}, ${ctx.areaName}`,
      ar: `${type.ar}${suffixAr} ${ctx.areaSqm} متر في ${ctx.compoundNameAr}، ${ctx.areaNameAr}`,
    };
  }
  return {
    en: `${capitalise(finishing.en)} ${prefixEn}${type.en} in ${ctx.compoundName}, ${ctx.areaName}`,
    ar: `${type.ar}${suffixAr} ${finishing.ar} في ${ctx.compoundNameAr}، ${ctx.areaNameAr}`,
  };
}

function capitalise(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function openingSentence(ctx, rng) {
  const type = PROPERTY_TYPE_LABELS[ctx.propertyType];
  const finishing = FINISHING_LABELS[ctx.finishing];
  const typeEn = type.en.toLowerCase();

  if (isCommercial(ctx.propertyType)) {
    return {
      en: `This ${ctx.areaSqm} m² ${typeEn} sits inside ${ctx.compoundName} in ${ctx.areaName} and is handed over ${finishing.enPhrase}, ready to be fitted out for its tenant.`,
      ar: `${type.ar} بمساحة ${ctx.areaSqm} متر مربع داخل ${ctx.compoundNameAr} في ${ctx.areaNameAr}، والتسليم ${finishing.arPhrase} وجاهز للتجهيز حسب احتياج المستأجر.`,
    };
  }

  if (ctx.propertyType === 'studio') {
    return {
      en: `This ${ctx.areaSqm} m² studio in ${ctx.compoundName}, ${ctx.areaName} is laid out as an open-plan living and sleeping space with ${bathroomsEn(ctx.bathrooms)}, delivered ${finishing.enPhrase}.`,
      ar: `${type.ar} بمساحة ${ctx.areaSqm} متر مربع في ${ctx.compoundNameAr}، ${ctx.areaNameAr} بتصميم مفتوح يجمع المعيشة والنوم مع ${bathroomsAr(ctx.bathrooms)}، والتسليم ${finishing.arPhrase}.`,
    };
  }

  const variant = rng.int(0, 2);
  if (variant === 0) {
    return {
      en: `This ${finishing.en} ${typeEn} in ${ctx.compoundName}, ${ctx.areaName} offers ${ctx.areaSqm} m² with ${bedroomsEn(ctx.bedrooms)} and ${bathroomsEn(ctx.bathrooms)}.`,
      ar: `${type.ar} بمساحة ${ctx.areaSqm} متر مربع في ${ctx.compoundNameAr}، ${ctx.areaNameAr}, ${bedroomsAr(ctx.bedrooms)} و${bathroomsAr(ctx.bathrooms)}، والتسليم ${finishing.arPhrase}.`,
    };
  }
  if (variant === 1) {
    return {
      en: `Set inside ${ctx.compoundName} in ${ctx.areaName}, this ${typeEn} spans ${ctx.areaSqm} m² across ${bedroomsEn(ctx.bedrooms)} and ${bathroomsEn(ctx.bathrooms)}, delivered ${finishing.enPhrase}.`,
      ar: `داخل ${ctx.compoundNameAr} في ${ctx.areaNameAr}: ${type.ar} بمساحة ${ctx.areaSqm} متر مربع تضم ${bedroomsAr(ctx.bedrooms)} و${bathroomsAr(ctx.bathrooms)}، والتسليم ${finishing.arPhrase}.`,
    };
  }
  return {
    en: `A ${ctx.areaSqm} m² ${typeEn} in ${ctx.compoundName}, one of ${possessive(ctx.developerName)} flagship projects in ${ctx.areaName}, laid out with ${bedroomsEn(ctx.bedrooms)} and ${bathroomsEn(ctx.bathrooms)} and delivered ${finishing.enPhrase}.`,
    ar: `${type.ar} بمساحة ${ctx.areaSqm} متر مربع في ${ctx.compoundNameAr}، أحد أبرز مشروعات ${ctx.developerNameAr} في ${ctx.areaNameAr}، وتشمل ${bedroomsAr(ctx.bedrooms)} و${bathroomsAr(ctx.bathrooms)}، والتسليم ${finishing.arPhrase}.`,
  };
}

function featureSentence(ctx, rng) {
  const amenitiesEn = listEn(ctx.amenityLabels.map((a) => a.en.toLowerCase()));
  const amenitiesAr = listAr(ctx.amenityLabels.map((a) => a.ar));
  const parking = parkingEn(ctx.parkingSpots);
  const parkingArabic = parkingAr(ctx.parkingSpots);

  if (isCommercial(ctx.propertyType)) {
    return {
      en: `It occupies the ${floorOrdinalEn(ctx.floor)} floor with ${parking}, and the building services include ${amenitiesEn}.`,
      ar: `تقع الوحدة في الدور ${floorOrdinalAr(ctx.floor)} مع ${parkingArabic}، وتشمل خدمات المشروع ${amenitiesAr}.`,
    };
  }
  if (ctx.gardenSqm > 0) {
    return {
      en: `It comes with a private garden of ${ctx.gardenSqm} m² and ${parking}, plus access to ${amenitiesEn}.`,
      ar: `تضم الوحدة حديقة خاصة بمساحة ${ctx.gardenSqm} متر مربع و${parkingArabic}، بالإضافة إلى ${amenitiesAr}.`,
    };
  }
  if (ctx.isCoastal) {
    const seaView = rng.bool(0.5);
    return {
      en: `The unit is positioned on the ${floorOrdinalEn(ctx.floor)} floor with a view over ${seaView ? 'the sea' : 'the lagoon'}, ${parking}, and use of ${amenitiesEn}.`,
      ar: `تقع الوحدة في الدور ${floorOrdinalAr(ctx.floor)} بإطلالة على ${seaView ? 'البحر' : 'البحيرة'}، مع ${parkingArabic}، واستخدام ${amenitiesAr}.`,
    };
  }
  if (ctx.hasFloor) {
    return {
      en: `The unit sits on the ${floorOrdinalEn(ctx.floor)} floor with ${parking}, and residents use ${amenitiesEn}.`,
      ar: `تقع الوحدة في الدور ${floorOrdinalAr(ctx.floor)} مع ${parkingArabic}، ويستفيد السكان من ${amenitiesAr}.`,
    };
  }
  return {
    en: `Residents have ${amenitiesEn} inside a gated community managed by ${ctx.developerName}, with ${parking} for the unit.`,
    ar: `يتمتع السكان بـ${amenitiesAr} داخل مجتمع مغلق تديره ${ctx.developerNameAr}، مع ${parkingArabic} للوحدة.`,
  };
}

function paymentSentence(ctx, rng) {
  const downPayment = Math.round((ctx.price * ctx.downPaymentPercent) / 100);
  const variant = rng.int(0, 1);

  if (variant === 0) {
    return {
      en: `It is priced at ${egp(ctx.price)} (${egp(ctx.pricePerMeter)} per m²) with a ${ctx.downPaymentPercent}% down payment of ${egp(downPayment)} and the balance over ${ctx.installmentYears} years at about ${egp(ctx.monthlyInstallment)} per month.`,
      ar: `سعر الوحدة ${egpAr(ctx.price)} (${groupDigits(ctx.pricePerMeter)} جنيه للمتر) بمقدم ${ctx.downPaymentPercent}% أي ${egpAr(downPayment)}، والباقي على ${ctx.installmentYears} سنوات بنحو ${egpAr(ctx.monthlyInstallment)} شهريًا.`,
    };
  }
  return {
    en: `Payment starts with ${ctx.downPaymentPercent}% down (${egp(downPayment)}) on a total of ${egp(ctx.price)}, followed by roughly ${egp(ctx.monthlyInstallment)} a month for ${ctx.installmentYears} years, ${egp(ctx.pricePerMeter)} per m².`,
    ar: `يبدأ السداد بمقدم ${ctx.downPaymentPercent}% (${egpAr(downPayment)}) من إجمالي ${egpAr(ctx.price)}، ثم نحو ${egpAr(ctx.monthlyInstallment)} شهريًا لمدة ${ctx.installmentYears} سنوات، بمتوسط ${groupDigits(ctx.pricePerMeter)} جنيه للمتر.`,
  };
}

function closingSentence(ctx) {
  const quarterEn = quarterLabelEn(ctx.deliveryDate);
  const quarterAr = quarterLabelAr(ctx.deliveryDate);

  switch (ctx.status) {
    case 'off_plan':
      return {
        en: `Construction is under way with delivery scheduled for ${quarterEn}, and the unit can be reserved now at the current phase price.`,
        ar: `الأعمال الإنشائية جارية والتسليم مقرر في ${quarterAr}، ويمكن حجز الوحدة الآن بسعر المرحلة الحالية.`,
      };
    case 'delivered':
      return {
        en: `${ctx.compoundName} is already delivered, so this unit is ready for immediate move-in.`,
        ar: `تم تسليم ${ctx.compoundNameAr} بالفعل، لذا فإن الوحدة جاهزة للسكن الفوري.`,
      };
    case 'reserved':
      return {
        en: `The unit is currently reserved, ask a Nawy consultant about identical layouts released in the same phase.`,
        ar: `الوحدة محجوزة حاليًا، ويمكنك سؤال مستشار ناوي عن وحدات مماثلة في نفس المرحلة.`,
      };
    case 'sold':
      return {
        en: `This unit has been sold, but similar units in ${ctx.compoundName} are still available on request.`,
        ar: `تم بيع هذه الوحدة، لكن ما زالت هناك وحدات مشابهة في ${ctx.compoundNameAr} متاحة عند الطلب.`,
      };
    default:
      return ctx.deliveryInFuture
        ? {
            en: `The unit is available for viewing and is scheduled for handover in ${quarterEn}.`,
            ar: `الوحدة متاحة للمعاينة والتسليم مقرر في ${quarterAr}.`,
          }
        : {
            en: `Handover took place in ${quarterEn}, so the unit is available to view and move into straight away.`,
            ar: `تم التسليم في ${quarterAr}، لذا فإن الوحدة متاحة للمعاينة والسكن فورًا.`,
          };
  }
}

export function buildDescription(ctx, rng) {
  const parts = [
    openingSentence(ctx, rng),
    featureSentence(ctx, rng),
    paymentSentence(ctx, rng),
    closingSentence(ctx),
  ];
  return {
    en: parts.map((p) => p.en).join(' '),
    ar: parts.map((p) => p.ar).join(' '),
  };
}
