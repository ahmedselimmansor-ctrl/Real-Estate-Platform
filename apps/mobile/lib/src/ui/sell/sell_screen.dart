import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../core/api_exception.dart';
import '../../data/repositories.dart';
import '../../l10n/strings.dart';
import '../../models/catalog.dart';
import '../property/lead_sheet.dart' show kDialCode, kEgyptianMobile;
import '../search/filter_sheet.dart' show kPropertyTypes;
import '../widgets/states.dart';

/// "Sell your property": the seller side of the marketplace.
///
/// Three steps then a form, matching the web flow, so a seller who started on
/// one surface recognises the other.
class SellScreen extends StatefulWidget {
  const SellScreen({super.key});

  @override
  State<SellScreen> createState() => _SellScreenState();
}

class _SellScreenState extends State<SellScreen> {
  final _formKey = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _phone = TextEditingController();
  final _message = TextEditingController();

  late Future<(List<Area>, List<Compound>)> _catalog;

  String? _areaId;
  String? _compoundId;
  String? _propertyType;
  bool _sending = false;
  bool _sent = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _catalog = _loadCatalog();
  }

  Future<(List<Area>, List<Compound>)> _loadCatalog() async {
    final repository = context.read<CatalogRepository>();
    final results = await Future.wait([repository.areas(), repository.compounds()]);
    return (results[0] as List<Area>, results[1] as List<Compound>);
  }

  @override
  void dispose() {
    _name.dispose();
    _phone.dispose();
    _message.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;

    setState(() {
      _sending = true;
      _error = null;
    });

    try {
      await context.read<LeadsRepository>().create(
            name: _name.text.trim(),
            phone: '$kDialCode${_phone.text.trim().replaceFirst(RegExp(r'^0'), '')}',
            source: 'mobile_sell',
            areaId: _areaId,
            compoundId: _compoundId,
            propertyType: _propertyType,
            message: _message.text.trim(),
          );
      if (!mounted) return;
      setState(() {
        _sending = false;
        _sent = true;
      });
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _sending = false;
        _error = error.firstFieldError ?? error.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _sending = false;
        _error = Strings.of(context).offlineHint;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);

    return Scaffold(
      appBar: AppBar(title: Text(strings.sell)),
      body: FutureBuilder<(List<Area>, List<Compound>)>(
        future: _catalog,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return ErrorState(
              error: snapshot.error!,
              onRetry: () => setState(() => _catalog = _loadCatalog()),
            );
          }

          final (areas, compounds) = snapshot.data!;
          // Picking an area narrows the compound list: a seller knows their
          // compound but not which of thirty shares a similar name.
          final scoped =
              _areaId == null ? compounds : compounds.where((c) => c.areaId == _areaId).toList();

          return ListView(
            padding: const EdgeInsets.fromLTRB(20, 20, 20, 32),
            children: [
              Icon(
                Icons.sell_outlined,
                size: 44,
                color: Theme.of(context).colorScheme.primary,
              ),
              const SizedBox(height: 12),
              Text(
                strings.sellTitle,
                textAlign: TextAlign.center,
                style: Theme.of(context)
                    .textTheme
                    .headlineSmall
                    ?.copyWith(fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 24),
              _Steps(strings: strings),
              const SizedBox(height: 28),
              if (_sent)
                _SellSuccess(strings: strings, onAgain: () => setState(() => _sent = false))
              else
                _form(strings, areas, scoped),
            ],
          );
        },
      ),
    );
  }

  Widget _form(Strings strings, List<Area> areas, List<Compound> compounds) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                strings.completeTheForm,
                style:
                    Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 4),
              Text(
                strings.privacyNote,
                style: TextStyle(
                  fontSize: 12,
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
              ),
              const SizedBox(height: 18),
              TextFormField(
                controller: _name,
                textInputAction: TextInputAction.next,
                decoration: InputDecoration(labelText: strings.fullName),
                validator: (value) =>
                    (value == null || value.trim().length < 2) ? strings.fieldRequired : null,
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _phone,
                keyboardType: TextInputType.phone,
                inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                decoration: InputDecoration(
                  labelText: strings.phone,
                  hintText: '01001234567',
                  prefixText: '$kDialCode ',
                ),
                validator: (value) =>
                    kEgyptianMobile.hasMatch(value?.trim() ?? '') ? null : strings.invalidPhone,
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: _areaId,
                decoration: InputDecoration(labelText: strings.selectLocation),
                isExpanded: true,
                items: [
                  for (final area in areas)
                    DropdownMenuItem(
                      value: area.id,
                      child: Text(area.name.pick(strings.locale), overflow: TextOverflow.ellipsis),
                    ),
                ],
                onChanged: (value) => setState(() {
                  _areaId = value;
                  _compoundId = null; // the old pick may not be in this area
                }),
                validator: (value) => value == null ? strings.fieldRequired : null,
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: _compoundId,
                decoration: InputDecoration(labelText: strings.selectCompound),
                isExpanded: true,
                items: [
                  DropdownMenuItem(value: null, child: Text(strings.notInCompound)),
                  for (final compound in compounds)
                    DropdownMenuItem(
                      value: compound.id,
                      child:
                          Text(compound.name.pick(strings.locale), overflow: TextOverflow.ellipsis),
                    ),
                ],
                onChanged: (value) => setState(() => _compoundId = value),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: _propertyType,
                decoration: InputDecoration(labelText: strings.propertyType),
                isExpanded: true,
                items: [
                  for (final type in kPropertyTypes)
                    DropdownMenuItem(value: type, child: Text(strings.propertyTypeLabel(type))),
                ],
                onChanged: (value) => setState(() => _propertyType = value),
                validator: (value) => value == null ? strings.fieldRequired : null,
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _message,
                maxLines: 4,
                decoration: InputDecoration(
                  labelText: strings.message,
                  hintText: strings.pick(
                    'Size, bedrooms, floor, finishing, asking price',
                    'المساحة، عدد الغرف، الدور، التشطيب، السعر المطلوب',
                  ),
                ),
              ),
              if (_error != null) ...[
                const SizedBox(height: 12),
                Text(
                  _error!,
                  style: TextStyle(color: Theme.of(context).colorScheme.error, fontSize: 13),
                ),
              ],
              const SizedBox(height: 20),
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: _sending ? null : _submit,
                  child: Text(_sending ? strings.sending : strings.submit),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Steps extends StatelessWidget {
  const _Steps({required this.strings});

  final Strings strings;

  @override
  Widget build(BuildContext context) {
    final steps = [
      (strings.sellStep1, strings.sellStep1Body),
      (strings.sellStep2, strings.sellStep2Body),
      (strings.sellStep3, strings.sellStep3Body),
    ];

    return Column(
      children: [
        for (var i = 0; i < steps.length; i++)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 34,
                  height: 34,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: Theme.of(context).colorScheme.primary.withValues(alpha: 0.12),
                    shape: BoxShape.circle,
                  ),
                  child: Text(
                    '${i + 1}',
                    style: TextStyle(
                      fontWeight: FontWeight.w700,
                      color: Theme.of(context).colorScheme.primary,
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(steps[i].$1, style: const TextStyle(fontWeight: FontWeight.w600)),
                      const SizedBox(height: 2),
                      Text(
                        steps[i].$2,
                        style: TextStyle(
                          fontSize: 12.5,
                          color: Theme.of(context).colorScheme.onSurfaceVariant,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }
}

class _SellSuccess extends StatelessWidget {
  const _SellSuccess({required this.strings, required this.onAgain});

  final Strings strings;
  final VoidCallback onAgain;

  @override
  Widget build(BuildContext context) => Card(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            children: [
              Icon(
                Icons.check_circle_outline,
                size: 44,
                color: Theme.of(context).colorScheme.primary,
              ),
              const SizedBox(height: 12),
              Text(
                strings.leadSent,
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: 16),
              OutlinedButton(
                onPressed: onAgain,
                child: Text(strings.pick('List another property', 'اعرض عقارًا آخر')),
              ),
            ],
          ),
        ),
      );
}
