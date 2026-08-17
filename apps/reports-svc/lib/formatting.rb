# frozen_string_literal: true

require 'bigdecimal'
require 'date'
require 'time'

module Reports
  # Presentation helpers shared by the PDF brochure and the CSV exports.
  module Formatting
    MONTHS = %w[January February March April May June July August September
                October November December].freeze

    # Characters that Prawn's built-in (WinAnsi) fonts cannot encode get folded
    # to a close ASCII equivalent; anything left over is dropped.
    TRANSLITERATIONS = {
      '–' => '-', '—' => '-', '‑' => '-', '−' => '-',
      '“' => '"', '”' => '"', '„' => '"', '‘' => "'", '’' => "'",
      '…' => '...', ' ' => ' ', '‏' => '', '‎' => '',
      '•' => '-', '→' => '->', '×' => 'x'
    }.freeze

    module_function

    # 8500000 -> "8,500,000"
    def thousands(value)
      number = value.is_a?(BigDecimal) ? value.to_i : value.to_f.round
      negative = number.negative?
      digits = number.abs.to_s.reverse.scan(/\d{1,3}/).join(',').reverse
      negative ? "-#{digits}" : digits
    end

    # 8500000 -> "EGP 8,500,000" (CONTRACT §8 currency format)
    def egp(value)
      "EGP #{thousands(value)}"
    end

    # 8884.88 -> "EGP 8,884.88"
    def egp_precise(value)
      decimal = BigDecimal(value.to_s).round(2)
      sign = decimal.negative? ? '-' : ''
      piastres = (decimal.abs * 100).round
      "#{sign}EGP #{thousands(piastres / 100)}.#{format('%02d', piastres % 100)}"
    end

    def per_meter(value)
      "EGP #{thousands(value)} / m²"
    end

    def percent(value)
      decimal = BigDecimal(value.to_s)
      decimal.frac.zero? ? "#{decimal.to_i}%" : "#{decimal.round(2).to_f}%"
    end

    def area(value)
      return '—' if value.nil?

      "#{thousands(value)} m²"
    end

    # "semi_finished" -> "Semi Finished"
    def humanize(value)
      return '—' if value.nil? || value.to_s.strip.empty?

      value.to_s.tr('_-', '  ').split(/\s+/).map(&:capitalize).join(' ')
    end

    def long_date(value)
      date = to_date(value)
      return '—' unless date

      "#{date.day} #{MONTHS[date.month - 1]} #{date.year}"
    end

    def short_date(value)
      date = to_date(value)
      date ? date.strftime('%Y-%m-%d') : ''
    end

    def quarter(value)
      date = to_date(value)
      return '—' unless date

      "Q#{((date.month - 1) / 3) + 1} #{date.year}"
    end

    def iso_time(value)
      case value
      when nil then nil
      when Time then value.utc.iso8601(3)
      when DateTime then value.to_time.utc.iso8601(3)
      when Date then value.iso8601
      when String then value
      else value.to_s
      end
    end

    def to_date(value)
      case value
      when Date then value
      when Time then value.to_date
      when DateTime then value.to_date
      when String
        return nil if value.strip.empty?

        begin
          Date.parse(value)
        rescue ArgumentError
          nil
        end
      end
    end

    def to_time(value)
      case value
      when Time then value
      when DateTime then value.to_time
      when Date then value.to_time
      when String
        begin
          Time.parse(value)
        rescue ArgumentError
          nil
        end
      end
    end

    # "Palm Hills New Cairo — 3BR" -> "palm-hills-new-cairo-3br"
    def slugify(value, fallback: 'topchoice')
      slug = value.to_s.downcase.gsub(/[^a-z0-9]+/, '-').gsub(/\A-+|-+\z/, '')
      slug.empty? ? fallback : slug[0, 80]
    end

    # Makes a string safe for Prawn's built-in WinAnsi fonts.
    def pdf_safe(value)
      string = value.to_s.dup
      TRANSLITERATIONS.each { |from, to| string.gsub!(from, to) }
      string
        .encode('Windows-1252', invalid: :replace, undef: :replace, replace: '')
        .encode('UTF-8')
        .gsub(/[[:space:]]+/, ' ')
        .strip
    end

    # Truncate on a word boundary.
    def truncate(value, limit)
      string = value.to_s
      return string if string.length <= limit

      cut = string[0, limit]
      cut = cut[0, cut.rindex(' ') || limit]
      "#{cut.rstrip}…"
    end
  end
end
