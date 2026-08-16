# frozen_string_literal: true

RSpec.describe Reports::Formatting do
  describe '.egp' do
    it 'formats EGP with thousand separators (CONTRACT §8)' do
      expect(described_class.egp(8_500_000)).to eq('EGP 8,500,000')
      expect(described_class.egp(0)).to eq('EGP 0')
      expect(described_class.egp(950)).to eq('EGP 950')
    end
  end

  describe '.egp_precise' do
    it 'keeps piastres' do
      expect(described_class.egp_precise(8884.88)).to eq('EGP 8,884.88')
      expect(described_class.egp_precise(239_062.5)).to eq('EGP 239,062.50')
      expect(described_class.egp_precise(0.05)).to eq('EGP 0.05')
    end
  end

  describe '.per_meter' do
    it 'appends the m² unit' do
      expect(described_class.per_meter(47_222)).to eq('EGP 47,222 / m²')
    end
  end

  describe '.humanize' do
    it 'turns enum values into labels' do
      expect(described_class.humanize('semi_finished')).to eq('Semi Finished')
      expect(described_class.humanize('off_plan')).to eq('Off Plan')
      expect(described_class.humanize(nil)).to eq('—')
    end
  end

  describe '.quarter' do
    it 'renders a delivery quarter' do
      expect(described_class.quarter('2027-06-30')).to eq('Q2 2027')
      expect(described_class.quarter('2026-01-15')).to eq('Q1 2026')
      expect(described_class.quarter(nil)).to eq('—')
    end
  end

  describe '.slugify' do
    it 'produces a filename-safe slug' do
      expect(described_class.slugify('Palm Hills New Cairo — 3BR')).to eq('palm-hills-new-cairo-3br')
      expect(described_class.slugify('')).to eq('nawy')
      expect(described_class.slugify(nil, fallback: 'listing')).to eq('listing')
    end
  end

  describe '.pdf_safe' do
    it 'keeps Latin text and the m² symbol' do
      expect(described_class.pdf_safe('180 m² apartment')).to eq('180 m² apartment')
    end

    it 'folds typographic punctuation to ASCII' do
      expect(described_class.pdf_safe('Palm Hills — “New Cairo”')).to eq('Palm Hills - "New Cairo"')
    end

    it 'drops Arabic, which Prawn cannot shape' do
      expect(described_class.pdf_safe('شقة 3 غرف')).to eq('3')
    end

    it 'collapses whitespace' do
      expect(described_class.pdf_safe("a\n\n  b ")).to eq('a b')
    end
  end

  describe '.truncate' do
    it 'cuts on a word boundary' do
      expect(described_class.truncate('one two three four', 11)).to eq('one two…')
    end

    it 'leaves short strings alone' do
      expect(described_class.truncate('short', 20)).to eq('short')
    end
  end

  describe '.short_date / .iso_time' do
    it 'formats dates and timestamps' do
      expect(described_class.short_date('2027-06-30')).to eq('2027-06-30')
      expect(described_class.short_date(nil)).to eq('')
      expect(described_class.iso_time(Time.utc(2026, 8, 14))).to eq('2026-08-14T00:00:00.000Z')
      expect(described_class.iso_time(nil)).to be_nil
    end
  end

  describe '.area' do
    it 'formats square metres' do
      expect(described_class.area(180)).to eq('180 m²')
      expect(described_class.area(nil)).to eq('—')
    end
  end
end
