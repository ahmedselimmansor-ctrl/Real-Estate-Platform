import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../core/api_exception.dart';
import '../../data/repositories.dart';
import '../../l10n/strings.dart';
import '../../models/property.dart';

/// Egypt is the only market, so the dial code is fixed rather than a country
/// picker: one fewer decision on a form filled once.
const String kDialCode = '+20';

/// Local mobile numbers: 010/011/012/015 followed by eight digits, with the
/// leading zero optional because people type it both ways.
final RegExp kEgyptianMobile = RegExp(r'^0?1[0-9]{9}$');

/// "Request a callback" against a specific listing.
class LeadSheet extends StatefulWidget {
  const LeadSheet({super.key, required this.property});

  final Property property;

  @override
  State<LeadSheet> createState() => _LeadSheetState();
}

class _LeadSheetState extends State<LeadSheet> {
  final _formKey = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _phone = TextEditingController();
  final _message = TextEditingController();

  bool _sending = false;
  bool _sent = false;
  String? _error;

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
            source: 'mobile_property',
            propertyId: widget.property.id,
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

    return Padding(
      // Lifts the sheet above the keyboard, which otherwise covers the submit
      // button on the exact field that opens it.
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: SingleChildScrollView(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
          child: _sent ? _Success(strings: strings) : _form(strings),
        ),
      ),
    );
  }

  Widget _form(Strings strings) => Form(
        key: _formKey,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              strings.requestCallback,
              style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 4),
            Text(
              widget.property.title.pick(strings.locale),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant, fontSize: 13),
            ),
            const SizedBox(height: 20),
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
              textInputAction: TextInputAction.next,
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
            TextFormField(
              controller: _message,
              maxLines: 3,
              decoration: InputDecoration(
                labelText: '${strings.message} (${strings.optional})',
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
                child: _sending
                    ? Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          ),
                          const SizedBox(width: 10),
                          Text(strings.sending),
                        ],
                      )
                    : Text(strings.submit),
              ),
            ),
          ],
        ),
      );
}

class _Success extends StatelessWidget {
  const _Success({required this.strings});

  final Strings strings;

  @override
  Widget build(BuildContext context) => Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const SizedBox(height: 12),
          Icon(Icons.check_circle_outline, size: 48, color: Theme.of(context).colorScheme.primary),
          const SizedBox(height: 16),
          Text(
            strings.leadSent,
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 20),
          SizedBox(
            width: double.infinity,
            child: FilledButton.tonal(
              onPressed: () => Navigator.of(context).pop(),
              child: Text(strings.pick('Done', 'تم')),
            ),
          ),
        ],
      );
}
