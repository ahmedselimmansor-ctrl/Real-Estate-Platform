/// The filter set the search screen collects and search-svc understands.
///
/// Every field is optional; [toQuery] drops anything unset so the query string
/// only ever names what the user actually chose.
class SearchFilters {
  const SearchFilters({
    this.q,
    this.propertyTypes = const [],
    this.saleType,
    this.minPrice,
    this.maxPrice,
    this.bedrooms = const [],
    this.areaIds = const [],
    this.compoundIds = const [],
    this.sort = 'relevance',
  });

  final String? q;
  final List<String> propertyTypes;
  final String? saleType;
  final int? minPrice;
  final int? maxPrice;
  final List<int> bedrooms;
  final List<String> areaIds;
  final List<String> compoundIds;
  final String sort;

  SearchFilters copyWith({
    String? q,
    List<String>? propertyTypes,
    String? saleType,
    int? minPrice,
    int? maxPrice,
    List<int>? bedrooms,
    List<String>? areaIds,
    List<String>? compoundIds,
    String? sort,
    bool clearPrice = false,
    bool clearSaleType = false,
  }) =>
      SearchFilters(
        q: q ?? this.q,
        propertyTypes: propertyTypes ?? this.propertyTypes,
        saleType: clearSaleType ? null : (saleType ?? this.saleType),
        minPrice: clearPrice ? null : (minPrice ?? this.minPrice),
        maxPrice: clearPrice ? null : (maxPrice ?? this.maxPrice),
        bedrooms: bedrooms ?? this.bedrooms,
        areaIds: areaIds ?? this.areaIds,
        compoundIds: compoundIds ?? this.compoundIds,
        sort: sort ?? this.sort,
      );

  Map<String, dynamic> toQuery({int page = 1, int limit = 20}) => {
        'page': page,
        'limit': limit,
        'sort': sort,
        if (q != null && q!.trim().isNotEmpty) 'q': q!.trim(),
        if (propertyTypes.isNotEmpty) 'propertyType': propertyTypes,
        if (saleType != null) 'saleType': saleType,
        if (minPrice != null) 'minPrice': minPrice,
        if (maxPrice != null) 'maxPrice': maxPrice,
        if (bedrooms.isNotEmpty) 'bedrooms': bedrooms.map((b) => b.toString()).toList(),
        if (areaIds.isNotEmpty) 'areaId': areaIds,
        if (compoundIds.isNotEmpty) 'compoundId': compoundIds,
      };

  /// How many refinements are active, for the badge on the filter button.
  int get activeCount =>
      propertyTypes.length +
      bedrooms.length +
      areaIds.length +
      compoundIds.length +
      (saleType != null ? 1 : 0) +
      (minPrice != null || maxPrice != null ? 1 : 0);

  bool get isEmpty => activeCount == 0 && (q == null || q!.trim().isEmpty);
}
