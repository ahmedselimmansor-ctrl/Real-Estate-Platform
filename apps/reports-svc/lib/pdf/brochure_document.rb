# frozen_string_literal: true

require 'prawn'
require 'prawn/table'
require 'time'

require_relative 'theme'
require_relative '../formatting'
require_relative '../http_fetch'
require_relative '../logging'

module Reports
  module Pdf
    # Renders the A4 property brochure.
    #
    # Layout (page 1):
    #   ┌──────────────────────────────────────────┐
    #   │ NAWY  ·  brand band  ·  reference + type │
    #   ├──────────────────────────────────────────┤
    #   │ hero image (graceful placeholder)        │
    #   │ title / location                          │
    #   │ price · EGP per m² · payment headline     │
    #   │ specifications table (two columns)        │
    #   │ amenities                                 │
    #   │ payment plan + yearly cash flow           │
    #   │ about the compound / developer            │
    #   │ location                                  │
    #   └── footer: listing URL · generated at · # ─┘
    #
    # Text is folded to a WinAnsi-safe subset (`Formatting.pdf_safe`): Prawn has
    # no Arabic shaping or BiDi engine, so the brochure is the English document.
    class BrochureDocument
      include Theme

      PAGE_MARGIN = [36, 36, 46, 36].freeze

      # @param view [Hash] built by Reports::Brochure.view_model
      def initialize(view)
        @view = view
      end

      # @return [String] the PDF bytes (binary encoded)
      def render
        document = Prawn::Document.new(
          page_size: 'A4',
          margin: PAGE_MARGIN,
          info: metadata,
          compress: true
        )
        setup_fonts(document)

        draw_header(document)
        draw_hero(document)
        draw_headline(document)
        draw_price_strip(document)
        draw_specs(document)
        draw_amenities(document)
        draw_payment_plan(document)
        draw_about(document)
        draw_location(document)
        draw_footer(document)

        document.render
      end

      private

      attr_reader :view

      def metadata
        {
          Title: safe("#{view[:title]} — #{view[:reference_no]}"),
          Author: 'Nawy',
          Subject: safe("Property brochure for #{view[:reference_no]}"),
          Creator: 'nawy-clone reports-svc',
          Producer: 'Prawn',
          CreationDate: Time.now
        }
      end

      def setup_fonts(doc)
        return unless Theme.dejavu_available?

        doc.font_families.update('DejaVu' => Theme.dejavu_family)
        doc.font('DejaVu')
      rescue StandardError => e
        Logging.warn('brochure.font_fallback', error: e.class.name, errorMessage: e.message)
      end

      # --- sections ---------------------------------------------------------

      def draw_header(doc)
        doc.repeat([1]) do
          doc.canvas do
            doc.fill_color BRAND_DEEP
            doc.fill_rectangle [0, doc.bounds.top], doc.bounds.width, HEADER_HEIGHT
            doc.fill_color BRAND
            doc.fill_rectangle [0, doc.bounds.top], doc.bounds.width, 6

            doc.fill_color WHITE
            doc.font_size(22) do
              doc.text_box 'NAWY', at: [36, doc.bounds.top - 26], width: 200, height: 30, style: :bold
            end
            doc.font_size(8.5) do
              doc.text_box safe('EGYPT REAL ESTATE  ·  PROPERTY BROCHURE'),
                           at: [36, doc.bounds.top - 52], width: 300, height: 14
            end

            doc.font_size(9) do
              doc.text_box safe(view[:reference_no].to_s), at: [doc.bounds.width - 236, doc.bounds.top - 28],
                           width: 200, height: 14, align: :right, style: :bold
              doc.text_box safe([view[:property_type], view[:sale_type], view[:status]].compact.join('  ·  ')),
                           at: [doc.bounds.width - 236, doc.bounds.top - 44], width: 200, height: 14,
                           align: :right
              doc.text_box safe(view[:generated_on]), at: [doc.bounds.width - 236, doc.bounds.top - 60],
                           width: 200, height: 14, align: :right
            end
          end
        end

        doc.move_down HEADER_HEIGHT - PAGE_MARGIN[0] + 18
      end

      def draw_hero(doc)
        top = doc.cursor
        doc.fill_color SOFT
        doc.fill_rounded_rectangle [0, top], doc.bounds.width, HERO_HEIGHT, 8
        doc.fill_color INK

        image_io = view[:hero_image_io]
        if image_io
          begin
            doc.bounding_box([6, top - 6], width: doc.bounds.width - 12, height: HERO_HEIGHT - 12) do
              doc.image image_io, position: :center, vposition: :center,
                                  fit: [doc.bounds.width, doc.bounds.height]
            end
          rescue StandardError => e
            Logging.warn('brochure.image_render_failed', error: e.class.name, errorMessage: e.message)
            draw_image_placeholder(doc, top)
          end
        else
          draw_image_placeholder(doc, top)
        end

        doc.move_cursor_to top - HERO_HEIGHT
        doc.move_down 18
      end

      def draw_image_placeholder(doc, top)
        doc.fill_color MUTED
        doc.font_size(10) do
          doc.text_box safe('Photography available on nawy.com'),
                       at: [0, top - (HERO_HEIGHT / 2) + 6], width: doc.bounds.width,
                       height: 20, align: :center
        end
        doc.fill_color INK
      end

      def draw_headline(doc)
        doc.fill_color INK
        doc.font_size(17) { doc.text safe(view[:title]), style: :bold, leading: 2 }
        doc.move_down 4
        doc.fill_color MUTED
        doc.font_size(10) { doc.text safe(view[:location_line]) }
        doc.fill_color INK
        doc.move_down 12
      end

      def draw_price_strip(doc)
        top = doc.cursor
        height = 64

        doc.fill_color SOFTER
        doc.fill_rounded_rectangle [0, top], doc.bounds.width, height, 6
        doc.stroke_color LINE
        doc.stroke_rounded_rectangle [0, top], doc.bounds.width, height, 6

        column = doc.bounds.width / 3.0
        cells = [
          ['PRICE', view[:price_label], BRAND_DARK],
          ['PRICE PER m²', view[:price_per_meter_label], INK],
          ['PAYMENT', view[:payment_headline], INK]
        ]

        cells.each_with_index do |(label, value, colour), index|
          x = column * index
          doc.fill_color MUTED
          doc.font_size(7.5) do
            doc.text_box safe(label), at: [x + 14, top - 14], width: column - 20, height: 12
          end
          doc.fill_color colour
          doc.font_size(index.zero? ? 15 : 11.5) do
            doc.text_box safe(value), at: [x + 14, top - 30], width: column - 20, height: 32,
                         style: :bold, overflow: :shrink_to_fit
          end
        end

        doc.fill_color INK
        doc.stroke_color LINE
        doc.move_cursor_to top - height
        doc.move_down 20
      end

      def draw_specs(doc)
        section_title(doc, 'Specifications')

        rows = view[:specs].each_slice(2).map do |(left, right)|
          [left[0], left[1], right ? right[0] : '', right ? right[1] : '']
        end
        return if rows.empty?

        column = doc.bounds.width / 4.0
        doc.table(rows.map { |row| row.map { |cell| safe(cell) } },
                  width: doc.bounds.width,
                  column_widths: [column * 0.95, column * 1.05, column * 0.95, column * 1.05],
                  cell_style: { borders: [:bottom], border_color: LINE, padding: [7, 8, 7, 8],
                                size: 9.5, text_color: BODY }) do |table|
          table.columns(0).font_style = :bold
          table.columns(2).font_style = :bold
          table.columns(0).text_color = MUTED
          table.columns(2).text_color = MUTED
          table.columns(0).size = 8.5
          table.columns(2).size = 8.5
          table.columns(1).text_color = INK
          table.columns(3).text_color = INK
        end

        doc.move_down 18
      end

      def draw_amenities(doc)
        amenities = Array(view[:amenities])
        return if amenities.empty?

        ensure_space(doc, 90)
        section_title(doc, 'Amenities')

        doc.fill_color BODY
        doc.font_size(9.5) do
          doc.text safe(amenities.join('   ·   ')), leading: 4
        end
        doc.fill_color INK
        doc.move_down 18
      end

      def draw_payment_plan(doc)
        plan = view[:payment_plan]
        return if plan.nil?

        ensure_space(doc, 200)
        section_title(doc, 'Payment plan')

        summary_rows = plan[:summary_rows].map { |label, value| [safe(label), safe(value)] }
        doc.table(summary_rows,
                  width: doc.bounds.width,
                  column_widths: [doc.bounds.width * 0.45, doc.bounds.width * 0.55],
                  cell_style: { borders: [:bottom], border_color: LINE, padding: [7, 8, 7, 8],
                                size: 9.5 }) do |table|
          table.columns(0).text_color = MUTED
          table.columns(0).size = 8.5
          table.columns(1).font_style = :bold
          table.columns(1).text_color = INK
        end

        cash_flow = Array(plan[:cash_flow_rows])
        return if cash_flow.empty?

        doc.move_down 14
        ensure_space(doc, 120)
        doc.fill_color MUTED
        doc.font_size(8.5) { doc.text safe('YEARLY CASH FLOW'), style: :bold }
        doc.fill_color INK
        doc.move_down 6

        header = %w[Year Payments Amount Cumulative]
        rows = [header] + cash_flow.map { |row| row.map { |cell| safe(cell) } }

        doc.table(rows,
                  width: doc.bounds.width,
                  header: true,
                  column_widths: [doc.bounds.width * 0.18, doc.bounds.width * 0.22,
                                  doc.bounds.width * 0.35, doc.bounds.width * 0.25],
                  cell_style: { borders: [:bottom], border_color: LINE, padding: [6, 8, 6, 8],
                                size: 9, text_color: BODY }) do |table|
          table.row(0).background_color = SOFT
          table.row(0).text_color = INK
          table.row(0).font_style = :bold
          table.row(0).size = 8.5
          table.columns(1..3).align = :right
        end

        doc.move_down 8
        doc.fill_color MUTED
        doc.font_size(7.5) do
          doc.text safe(plan[:disclaimer]), leading: 2
        end
        doc.fill_color INK
        doc.move_down 18
      end

      def draw_about(doc)
        blocks = Array(view[:about_blocks])
        return if blocks.empty?

        blocks.each do |block|
          ensure_space(doc, 110)
          section_title(doc, block[:title])
          doc.fill_color BODY
          doc.font_size(9.5) { doc.text safe(block[:body]), align: :justify, leading: 2.5 }
          if block[:meta] && !block[:meta].empty?
            doc.move_down 5
            doc.fill_color MUTED
            doc.font_size(8.5) { doc.text safe(block[:meta]) }
          end
          doc.fill_color INK
          doc.move_down 16
        end
      end

      def draw_location(doc)
        ensure_space(doc, 70)
        section_title(doc, 'Location')
        doc.fill_color BODY
        doc.font_size(9.5) { doc.text safe(view[:address_line]), leading: 2 }
        doc.move_down 3
        doc.fill_color MUTED
        doc.font_size(8.5) { doc.text safe(view[:coordinates_line]) }
        doc.fill_color INK
        doc.move_down 10
      end

      def draw_footer(doc)
        doc.repeat(:all, dynamic: true) do
          doc.canvas do
            y = 26
            doc.stroke_color LINE
            doc.line_width 0.5
            doc.stroke_line [36, y + 14], [doc.bounds.width - 36, y + 14]

            doc.fill_color MUTED
            doc.font_size(7.5) do
              doc.text_box safe(view[:listing_url]), at: [36, y + 6],
                           width: doc.bounds.width - 220, height: 12
              doc.text_box safe("Generated #{view[:generated_at_label]}  ·  Page #{doc.page_number}"),
                           at: [doc.bounds.width - 256, y + 6], width: 220, height: 12, align: :right
            end
            doc.font_size(6.5) do
              doc.text_box safe(view[:footer_disclaimer]), at: [36, y - 8],
                           width: doc.bounds.width - 72, height: 12
            end
            doc.fill_color INK
          end
        end
      end

      # --- primitives -------------------------------------------------------

      def section_title(doc, title)
        doc.fill_color BRAND_DARK
        doc.font_size(11) { doc.text safe(title), style: :bold }
        doc.move_down 3
        doc.stroke_color BRAND
        doc.line_width 1.2
        doc.stroke_horizontal_line 0, 42, at: doc.cursor
        doc.stroke_color LINE
        doc.line_width 0.5
        doc.fill_color INK
        doc.move_down 10
      end

      def ensure_space(doc, needed)
        doc.start_new_page if doc.cursor < needed
      end

      def safe(value)
        Formatting.pdf_safe(value)
      end
    end
  end
end
