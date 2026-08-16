# frozen_string_literal: true

module Reports
  module Pdf
    # Brand tokens for generated documents. The blue matches the web app's
    # primary colour (CONTRACT §8: "primary #00A3E0-family blue").
    module Theme
      BRAND      = '00A3E0'
      BRAND_DARK = '0B7FAD'
      BRAND_DEEP = '073B53'
      INK        = '0F172A'
      BODY       = '334155'
      MUTED      = '64748B'
      LINE       = 'E2E8F0'
      SOFT       = 'F1F5F9'
      SOFTER     = 'F8FAFC'
      WHITE      = 'FFFFFF'
      ACCENT     = 'F59E0B'
      SUCCESS    = '059669'

      HEADER_HEIGHT = 84
      FOOTER_HEIGHT = 34
      HERO_HEIGHT   = 244

      # DejaVu ships with the runtime image (fonts-dejavu-core) and has far
      # better glyph coverage than the built-in AFM fonts. When it is missing —
      # e.g. running specs on a bare machine — Prawn's Helvetica is used.
      DEJAVU_PATHS = {
        normal: '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
        bold: '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
        italic: '/usr/share/fonts/truetype/dejavu/DejaVuSans-Oblique.ttf',
        bold_italic: '/usr/share/fonts/truetype/dejavu/DejaVuSans-BoldOblique.ttf'
      }.freeze

      module_function

      def dejavu_available?
        DEJAVU_PATHS.values_at(:normal, :bold).all? { |path| File.readable?(path) }
      end

      # Falls back gracefully when only the two core weights exist.
      def dejavu_family
        family = { normal: DEJAVU_PATHS[:normal], bold: DEJAVU_PATHS[:bold] }
        family[:italic] = DEJAVU_PATHS[:italic] if File.readable?(DEJAVU_PATHS[:italic])
        family[:bold_italic] = DEJAVU_PATHS[:bold_italic] if File.readable?(DEJAVU_PATHS[:bold_italic])
        family
      end
    end
  end
end
