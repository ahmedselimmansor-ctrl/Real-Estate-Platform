import '../core/config.dart';

/// Bilingual text, as the API carries it: `{en, ar}`.
class Localized {
  const Localized({required this.en, required this.ar});

  final String en;
  final String ar;

  factory Localized.fromJson(dynamic json) {
    if (json is String) return Localized(en: json, ar: json);
    if (json is Map<String, dynamic>) {
      return Localized(
        en: (json['en'] as String?) ?? '',
        ar: (json['ar'] as String?) ?? '',
      );
    }
    return const Localized(en: '', ar: '');
  }

  /// Falls back to the other language rather than rendering an empty string:
  /// a missing translation should never blank the UI.
  String pick(String locale) {
    if (locale == 'ar') return ar.isNotEmpty ? ar : en;
    return en.isNotEmpty ? en : ar;
  }

  bool get isEmpty => en.isEmpty && ar.isEmpty;
}

class Price {
  const Price({required this.amount, required this.currency, this.perMeter});

  final int amount;
  final String currency;
  final int? perMeter;

  factory Price.fromJson(Map<String, dynamic>? json) {
    if (json == null) return const Price(amount: 0, currency: 'EGP');
    return Price(
      amount: (json['amount'] as num?)?.toInt() ?? 0,
      currency: (json['currency'] as String?) ?? 'EGP',
      perMeter: (json['pricePerMeter'] as num?)?.toInt(),
    );
  }
}

/// The instalment plan. In this market a unit is sold on the plan, not the
/// sticker price, so these fields drive as much of the UI as the price does.
class PaymentPlan {
  const PaymentPlan({
    required this.downPaymentPercent,
    required this.installmentYears,
    this.monthlyInstallment,
    this.deliveryDate,
  });

  final int downPaymentPercent;
  final int installmentYears;
  final int? monthlyInstallment;
  final String? deliveryDate;

  factory PaymentPlan.fromJson(Map<String, dynamic>? json) {
    if (json == null) return const PaymentPlan(downPaymentPercent: 0, installmentYears: 0);
    return PaymentPlan(
      downPaymentPercent: (json['downPaymentPercent'] as num?)?.toInt() ?? 0,
      installmentYears: (json['installmentYears'] as num?)?.toInt() ?? 0,
      monthlyInstallment: (json['monthlyInstallment'] as num?)?.toInt(),
      deliveryDate: json['deliveryDate'] as String?,
    );
  }

  bool get isReady => installmentYears == 0 && downPaymentPercent == 0;

  /// Derived when the API did not supply it, so the card always has a figure.
  int monthlyFor(int price) {
    if (monthlyInstallment != null && monthlyInstallment! > 0) return monthlyInstallment!;
    if (installmentYears <= 0) return 0;
    final financed = price * (100 - downPaymentPercent) / 100;
    return (financed / (installmentYears * 12)).round();
  }
}

class Specs {
  const Specs({
    required this.bedrooms,
    required this.bathrooms,
    required this.areaSqm,
    this.gardenSqm,
    this.floor,
    this.parkingSpots,
  });

  final int bedrooms;
  final int bathrooms;
  final int areaSqm;
  final int? gardenSqm;
  final int? floor;
  final int? parkingSpots;

  factory Specs.fromJson(Map<String, dynamic>? json) {
    if (json == null) return const Specs(bedrooms: 0, bathrooms: 0, areaSqm: 0);
    return Specs(
      bedrooms: (json['bedrooms'] as num?)?.toInt() ?? 0,
      bathrooms: (json['bathrooms'] as num?)?.toInt() ?? 0,
      areaSqm: (json['areaSqm'] as num?)?.toInt() ?? 0,
      gardenSqm: (json['gardenSqm'] as num?)?.toInt(),
      floor: (json['floor'] as num?)?.toInt(),
      parkingSpots: (json['parkingSpots'] as num?)?.toInt(),
    );
  }
}

class PropertyLocation {
  const PropertyLocation({
    required this.areaName,
    required this.city,
    this.areaId,
    this.address,
    this.lat,
    this.lng,
  });

  final String areaName;
  final String city;
  final String? areaId;
  final String? address;
  final double? lat;
  final double? lng;

  factory PropertyLocation.fromJson(Map<String, dynamic>? json) {
    if (json == null) return const PropertyLocation(areaName: '', city: '');

    double? lat;
    double? lng;
    final geo = json['geo'];
    if (geo is Map<String, dynamic> && geo['coordinates'] is List) {
      final coords = geo['coordinates'] as List;
      // GeoJSON is [lng, lat], which is the reverse of how everyone says it.
      if (coords.length >= 2) {
        lng = (coords[0] as num?)?.toDouble();
        lat = (coords[1] as num?)?.toDouble();
      }
    }

    return PropertyLocation(
      areaName: (json['areaName'] as String?) ?? '',
      city: (json['city'] as String?) ?? '',
      areaId: json['areaId'] as String?,
      address: json['address'] as String?,
      lat: lat,
      lng: lng,
    );
  }
}

class NamedRef {
  const NamedRef({required this.id, required this.name, required this.slug, this.logoUrl});

  final String id;
  final String name;
  final String slug;
  final String? logoUrl;

  static NamedRef? fromJson(Map<String, dynamic>? json) {
    if (json == null) return null;
    final name = json['name'];
    if (name is! String || name.isEmpty) return null;
    return NamedRef(
      id: (json['id'] as String?) ?? '',
      name: name,
      slug: (json['slug'] as String?) ?? '',
      logoUrl: json['logoUrl'] as String?,
    );
  }
}

/// A listing.
///
/// Tolerant by design: the same model is built from the Mongo document served
/// by api-core and from the flatter search-svc hit, which names a few fields
/// differently. Anything missing degrades to a sensible zero rather than
/// throwing, because one odd record must not take down a whole results page.
class Property {
  const Property({
    required this.id,
    required this.slug,
    required this.title,
    required this.propertyType,
    required this.saleType,
    required this.price,
    required this.specs,
    required this.plan,
    required this.location,
    required this.images,
    this.referenceNo = '',
    this.description = const Localized(en: '', ar: ''),
    this.status = 'available',
    this.finishing,
    this.compound,
    this.developer,
    this.amenities = const [],
    this.isFeatured = false,
  });

  final String id;
  final String slug;
  final Localized title;
  final Localized description;
  final String propertyType;
  final String saleType;
  final String status;
  final String? finishing;
  final Price price;
  final Specs specs;
  final PaymentPlan plan;
  final PropertyLocation location;
  final List<String> images;
  final String referenceNo;
  final NamedRef? compound;
  final NamedRef? developer;
  final List<String> amenities;
  final bool isFeatured;

  String get primaryImage => images.isEmpty ? '' : images.first;

  factory Property.fromJson(Map<String, dynamic> json) {
    // search-svc returns images as a flat `primaryImage` plus `images: [url]`;
    // api-core returns `media.images: [{url, isPrimary, order}]`.
    final images = <String>[];
    final media = json['media'];
    if (media is Map<String, dynamic> && media['images'] is List) {
      final list = (media['images'] as List).whereType<Map<String, dynamic>>().toList()
        ..sort((a, b) {
          final aPrimary = a['isPrimary'] == true ? 0 : 1;
          final bPrimary = b['isPrimary'] == true ? 0 : 1;
          if (aPrimary != bPrimary) return aPrimary.compareTo(bPrimary);
          return ((a['order'] as num?) ?? 0).compareTo((b['order'] as num?) ?? 0);
        });
      for (final image in list) {
        final url = image['url'];
        if (url is String && url.isNotEmpty) images.add(AppConfig.mediaUrl(url));
      }
    } else {
      final primary = json['primaryImage'];
      if (primary is String && primary.isNotEmpty) images.add(AppConfig.mediaUrl(primary));
      final rest = json['images'];
      if (rest is List) {
        for (final url in rest) {
          if (url is String && url.isNotEmpty) {
            final resolved = AppConfig.mediaUrl(url);
            if (!images.contains(resolved)) images.add(resolved);
          }
        }
      }
    }

    // The flat search hit spells location fields at the top level.
    final locationJson = json['location'] is Map<String, dynamic>
        ? json['location'] as Map<String, dynamic>
        : <String, dynamic>{
            'areaName': json['areaName'],
            'city': json['city'],
            'areaId': json['areaId'],
          };

    Map<String, dynamic>? refOf(String key, String nameKey) {
      final value = json[key];
      if (value is Map<String, dynamic>) return value;
      final name = json[nameKey];
      if (name is String && name.isNotEmpty) {
        return {'id': json['${key}Id'] ?? '', 'name': name, 'slug': json['${key}Slug'] ?? ''};
      }
      return null;
    }

    return Property(
      id: (json['id'] as String?) ?? (json['propertyId'] as String?) ?? '',
      slug: (json['slug'] as String?) ?? '',
      referenceNo: (json['referenceNo'] as String?) ?? '',
      title: Localized.fromJson(json['title']),
      description: Localized.fromJson(json['description']),
      propertyType: (json['propertyType'] as String?) ?? '',
      saleType: (json['saleType'] as String?) ?? '',
      status: (json['status'] as String?) ?? 'available',
      finishing: json['finishing'] as String?,
      price: Price.fromJson(
        json['price'] is Map<String, dynamic>
            ? json['price'] as Map<String, dynamic>
            : {'amount': json['price'] ?? json['priceMin']},
      ),
      specs: Specs.fromJson(json['specs'] as Map<String, dynamic>?),
      plan: PaymentPlan.fromJson(json['paymentPlan'] as Map<String, dynamic>?),
      location: PropertyLocation.fromJson(locationJson),
      images: images,
      compound: NamedRef.fromJson(refOf('compound', 'compoundName')),
      developer: NamedRef.fromJson(refOf('developer', 'developerName')),
      amenities: (json['amenities'] as List<dynamic>? ?? const []).whereType<String>().toList(),
      isFeatured: json['isFeatured'] == true,
    );
  }
}
