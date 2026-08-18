import '../core/config.dart';
import 'property.dart';

/// An area: New Cairo, Sheikh Zayed, the North Coast.
class Area {
  const Area({
    required this.id,
    required this.slug,
    required this.name,
    required this.city,
    this.heroImage,
    this.propertyCount = 0,
    this.avgPricePerMeter,
  });

  final String id;
  final String slug;
  final Localized name;
  final String city;
  final String? heroImage;
  final int propertyCount;
  final int? avgPricePerMeter;

  factory Area.fromJson(Map<String, dynamic> json) => Area(
        id: (json['id'] as String?) ?? '',
        slug: (json['slug'] as String?) ?? '',
        name: Localized(
          en: (json['nameEn'] as String?) ?? '',
          ar: (json['nameAr'] as String?) ?? '',
        ),
        city: (json['city'] as String?) ?? '',
        heroImage:
            json['heroImage'] is String ? AppConfig.mediaUrl(json['heroImage'] as String) : null,
        propertyCount: (json['propertyCount'] as num?)?.toInt() ?? 0,
        avgPricePerMeter: (json['avgPricePerMeter'] as num?)?.toInt(),
      );
}

/// A developer: Palm Hills, SODIC, Emaar Misr.
class Developer {
  const Developer({
    required this.id,
    required this.slug,
    required this.name,
    this.logoUrl,
    this.projectsCount = 0,
    this.isFeatured = false,
  });

  final String id;
  final String slug;
  final Localized name;
  final String? logoUrl;
  final int projectsCount;
  final bool isFeatured;

  factory Developer.fromJson(Map<String, dynamic> json) => Developer(
        id: (json['id'] as String?) ?? '',
        slug: (json['slug'] as String?) ?? '',
        name: Localized(
          en: (json['name'] as String?) ?? '',
          ar: (json['nameAr'] as String?) ?? '',
        ),
        logoUrl: json['logoUrl'] is String ? AppConfig.mediaUrl(json['logoUrl'] as String) : null,
        projectsCount: (json['projectsCount'] as num?)?.toInt() ?? 0,
        isFeatured: json['isFeatured'] == true,
      );
}

/// A compound: a masterplan, not a single unit.
class Compound {
  const Compound({
    required this.id,
    required this.slug,
    required this.name,
    this.areaId,
    this.areaName,
    this.developerName,
    this.startingPrice,
    this.deliveryYear,
    this.downPaymentPercent,
    this.installmentYears,
    this.images = const [],
    this.isFeatured = false,
  });

  final String id;
  final String slug;
  final Localized name;
  final String? areaId;
  final Localized? areaName;
  final Localized? developerName;
  final int? startingPrice;
  final int? deliveryYear;
  final int? downPaymentPercent;
  final int? installmentYears;
  final List<String> images;
  final bool isFeatured;

  String get primaryImage => images.isEmpty ? '' : images.first;

  factory Compound.fromJson(Map<String, dynamic> json) {
    final area = json['area'];
    final developer = json['developer'];
    return Compound(
      id: (json['id'] as String?) ?? '',
      slug: (json['slug'] as String?) ?? '',
      name: Localized(
        en: (json['name'] as String?) ?? '',
        ar: (json['nameAr'] as String?) ?? '',
      ),
      areaId: json['areaId'] as String?,
      areaName: area is Map
          ? Localized(
              en: (area['nameEn'] as String?) ?? '',
              ar: (area['nameAr'] as String?) ?? '',
            )
          : null,
      developerName: developer is Map
          ? Localized(
              en: (developer['name'] as String?) ?? '',
              ar: (developer['nameAr'] as String?) ?? '',
            )
          : null,
      startingPrice: (json['startingPrice'] as num?)?.toInt(),
      deliveryYear: (json['deliveryYear'] as num?)?.toInt(),
      downPaymentPercent: (json['downPaymentPercent'] as num?)?.toInt(),
      installmentYears: (json['installmentYears'] as num?)?.toInt(),
      images: (json['images'] as List<dynamic>? ?? const [])
          .whereType<String>()
          .map(AppConfig.mediaUrl)
          .toList(),
      isFeatured: json['isFeatured'] == true,
    );
  }
}
