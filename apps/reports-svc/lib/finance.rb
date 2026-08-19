# frozen_string_literal: true

require 'bigdecimal'
require 'bigdecimal/util'
require 'date'

require_relative 'errors'

module Reports
  # Pure-Ruby calculation engine. No IO, no globals, fully unit tested.
  #
  # Two products:
  #
  #   1. `mortgage`             — a bank loan repaid by a level monthly payment
  #                               (standard amortisation / annuity formula).
  #   2. `installment_schedule` — the developer plan an Egyptian primary sale
  #                               actually uses: a down payment at contract,
  #                               equal instalments (quarterly by default) over
  #                               N years, and a maintenance deposit on delivery.
  #
  # All money is EGP and rounded to piastres (2 decimals, half-up) using
  # BigDecimal so repeated addition never drifts.
  module Finance
    # Raised for any bad input; mapped to 422 / VALIDATION_ERROR by the app.
    class CalculationError < Errors::ValidationError; end

    CURRENCY  = 'EGP'
    SCALE     = 2
    ZERO      = BigDecimal('0')
    HUNDRED   = BigDecimal('100')
    MONTHS_PER_YEAR = 12

    # Developer-plan payment frequencies -> instalments per year.
    FREQUENCIES = {
      'monthly' => 12,
      'quarterly' => 4,
      'semi_annual' => 2,
      'annual' => 1
    }.freeze

    DEFAULT_FREQUENCY = 'quarterly'

    # Egyptian developers charge a maintenance deposit on handover, typically
    # 8–10% of the unit price. 8% is the common default.
    DEFAULT_MAINTENANCE_PERCENT = BigDecimal('8')

    MAX_YEARS = 40
    MAX_RATE  = BigDecimal('100')
    MAX_PRICE = BigDecimal('100000000000') # 100bn EGP — a sanity ceiling.

    module_function

    # =======================================================================
    # Mortgage
    # =======================================================================
    #
    #   principal = price × (1 − downPaymentPercent/100)
    #   r         = annualRatePercent / 100 / 12
    #   n         = years × 12
    #
    #             ⎧ principal / n                          when r = 0
    #   payment = ⎨            r (1 + r)ⁿ
    #             ⎩ principal ─────────────                otherwise
    #                          (1 + r)ⁿ − 1
    #
    # @return [Hash] summary + month-by-month schedule + yearly rollup
    def mortgage(price:, down_payment_percent:, years:, annual_rate_percent:, start_date: nil)
      price_d = validate_price!(price)
      down_pct = validate_percent!(down_payment_percent, 'downPaymentPercent')
      years_i = validate_years!(years)
      rate_pct = validate_rate!(annual_rate_percent)
      start = start_date.nil? ? nil : coerce_date!(start_date, 'startDate')

      down_payment = round_money(price_d * down_pct / HUNDRED)
      principal    = round_money(price_d - down_payment)
      months       = years_i * MONTHS_PER_YEAR
      monthly_rate = rate_pct / HUNDRED / BigDecimal(MONTHS_PER_YEAR.to_s)

      if principal <= ZERO
        raise CalculationError.field('downPaymentPercent',
                                     'leaves nothing to finance — the down payment covers the price')
      end

      payment  = level_payment(principal, monthly_rate, months)
      schedule = amortise(principal, monthly_rate, payment, months, start)

      total_interest = round_money(schedule.sum { |row| row[:interest] })
      total_paid     = round_money(schedule.sum { |row| row[:payment] })

      {
        currency: CURRENCY,
        input: {
          price: to_money(price_d),
          down_payment_percent: to_number(down_pct),
          years: years_i,
          annual_rate_percent: to_number(rate_pct),
          start_date: start
        },
        summary: {
          price: to_money(price_d),
          down_payment: to_money(down_payment),
          principal: to_money(principal),
          months: months,
          payments: schedule.length,
          monthly_rate: monthly_rate.round(10).to_f,
          monthly_payment: to_money(payment),
          first_payment: to_money(schedule.first ? schedule.first[:payment] : ZERO),
          last_payment: to_money(schedule.last ? schedule.last[:payment] : ZERO),
          total_interest: to_money(total_interest),
          total_paid: to_money(total_paid),
          total_cost: to_money(round_money(down_payment + total_paid)),
          interest_to_principal_ratio: ratio(total_interest, principal)
        },
        schedule: schedule.map { |row| present_amortisation_row(row) },
        yearly: yearly_rollup(schedule)
      }
    end

    # Level (annuity) payment, rounded up-to-the-piastre. Handles r = 0 without
    # dividing by zero.
    def level_payment(principal, monthly_rate, months)
      return round_money(principal / BigDecimal(months.to_s)) if monthly_rate <= ZERO

      growth = power(BigDecimal('1') + monthly_rate, months)
      numerator = principal * monthly_rate * growth
      denominator = growth - BigDecimal('1')
      raise CalculationError.field('annualRatePercent', 'produces a degenerate schedule') if denominator <= ZERO

      round_money(numerator / denominator)
    end

    # Month-by-month amortisation. The final payment absorbs rounding so the
    # balance lands on exactly 0.00 and Σprincipal == principal.
    def amortise(principal, monthly_rate, payment, months, start_date = nil)
      balance = principal
      rows = []

      (1..months).each do |month|
        break if balance <= ZERO

        interest = round_money(balance * monthly_rate)
        principal_part = round_money(payment - interest)
        principal_part = balance if principal_part > balance || month == months
        principal_part = balance if principal_part <= ZERO && balance.positive?

        actual_payment = round_money(principal_part + interest)
        balance = round_money(balance - principal_part)

        rows << {
          month: month,
          due_date: start_date && (start_date >> month),
          payment: actual_payment,
          interest: interest,
          principal: principal_part,
          balance: balance
        }
      end

      rows
    end

    def yearly_rollup(schedule)
      schedule.group_by { |row| ((row[:month] - 1) / MONTHS_PER_YEAR) + 1 }
              .map do |year, rows|
        {
          year: year,
          payments: rows.length,
          paid: to_money(round_money(rows.sum { |r| r[:payment] })),
          interest: to_money(round_money(rows.sum { |r| r[:interest] })),
          principal: to_money(round_money(rows.sum { |r| r[:principal] })),
          closing_balance: to_money(rows.last[:balance])
        }
      end
    end

    # =======================================================================
    # Developer instalment plan
    # =======================================================================
    #
    #   downPayment  = price × downPaymentPercent / 100        (due at contract)
    #   remaining    = price − downPayment
    #   count        = years × instalmentsPerYear
    #   instalment   = remaining / count           (last one absorbs rounding)
    #   maintenance  = price × maintenancePercent / 100        (due on delivery)
    #
    # @return [Hash] summary + dated schedule + yearly rollup
    def installment_schedule(price:, down_payment_percent:, years:, delivery_date: nil,
                             frequency: DEFAULT_FREQUENCY, start_date: nil,
                             maintenance_percent: DEFAULT_MAINTENANCE_PERCENT)
      price_d  = validate_price!(price)
      down_pct = validate_percent!(down_payment_percent, 'downPaymentPercent')
      years_i  = validate_years!(years)
      freq     = validate_frequency!(frequency)
      per_year = FREQUENCIES.fetch(freq)
      start    = start_date.nil? ? Date.today : coerce_date!(start_date, 'startDate')
      delivery = delivery_date.nil? ? nil : coerce_date!(delivery_date, 'deliveryDate')
      maint_pct = validate_percent!(maintenance_percent, 'maintenancePercent')

      down_payment = round_money(price_d * down_pct / HUNDRED)
      remaining    = round_money(price_d - down_payment)
      count        = years_i * per_year
      step_months  = MONTHS_PER_YEAR / per_year
      maintenance  = round_money(price_d * maint_pct / HUNDRED)

      base_installment = count.positive? ? round_money(remaining / BigDecimal(count.to_s)) : ZERO

      entries = []
      entries << {
        sequence: 0,
        type: 'down_payment',
        label: "Down payment (#{to_number(down_pct)}%)",
        due_date: start,
        amount: down_payment
      }

      outstanding = remaining
      (1..count).each do |index|
        amount = index == count ? outstanding : base_installment
        amount = outstanding if amount > outstanding
        outstanding = round_money(outstanding - amount)

        entries << {
          sequence: index,
          type: 'installment',
          label: "#{frequency_label(freq)} instalment #{index} of #{count}",
          due_date: start >> (step_months * index),
          amount: amount
        }
      end

      last_installment_date = entries.last[:due_date]
      if maintenance.positive?
        entries << {
          sequence: count + 1,
          type: 'maintenance',
          label: "Maintenance deposit (#{to_number(maint_pct)}%)",
          due_date: delivery || last_installment_date,
          amount: maintenance
        }
      end

      schedule = build_installment_rows(entries, price_d)
      total_cash = round_money(entries.sum { |entry| entry[:amount] })

      {
        currency: CURRENCY,
        input: {
          price: to_money(price_d),
          down_payment_percent: to_number(down_pct),
          years: years_i,
          delivery_date: delivery,
          frequency: freq,
          start_date: start,
          maintenance_percent: to_number(maint_pct)
        },
        summary: {
          price: to_money(price_d),
          down_payment: to_money(down_payment),
          remaining: to_money(remaining),
          installments_count: count,
          installments_per_year: per_year,
          installment_amount: to_money(base_installment),
          final_installment_amount: to_money(entries.reverse.find do |e|
            e[:type] == 'installment'
          end&.fetch(:amount) || ZERO),
          monthly_equivalent: to_money(
            if count.positive?
              round_money(remaining / BigDecimal((years_i * MONTHS_PER_YEAR).to_s))
            else
              ZERO
            end
          ),
          maintenance_percent: to_number(maint_pct),
          maintenance_deposit: to_money(maintenance),
          total_paid: to_money(total_cash),
          first_due_date: start,
          last_due_date: schedule.last[:due_date],
          delivery_date: delivery
        },
        schedule: schedule,
        yearly: installment_yearly_rollup(schedule)
      }
    end

    # =======================================================================
    # Internals
    # =======================================================================

    def build_installment_rows(entries, price)
      sorted = entries.sort_by { |entry| [entry[:due_date], type_weight(entry[:type]), entry[:sequence]] }

      cumulative_cash  = ZERO
      cumulative_price = ZERO

      sorted.map do |entry|
        cumulative_cash = round_money(cumulative_cash + entry[:amount])
        cumulative_price = round_money(cumulative_price + entry[:amount]) unless entry[:type] == 'maintenance'

        {
          sequence: entry[:sequence],
          type: entry[:type],
          label: entry[:label],
          due_date: entry[:due_date],
          amount: to_money(entry[:amount]),
          cumulative_paid: to_money(cumulative_cash),
          cumulative_percent: percent_of(cumulative_price, price)
        }
      end
    end

    def installment_yearly_rollup(schedule)
      schedule.group_by { |row| row[:due_date].year }
              .sort_by(&:first)
              .map do |year, rows|
        {
          year: year,
          payments: rows.length,
          paid: round_money(rows.sum { |r| BigDecimal(r[:amount].to_s) }).to_f,
          cumulative_percent: rows.last[:cumulative_percent]
        }
      end
    end

    def type_weight(type)
      case type
      when 'down_payment' then 0
      when 'installment'  then 1
      else 2
      end
    end

    def frequency_label(frequency)
      { 'monthly' => 'Monthly', 'quarterly' => 'Quarterly',
        'semi_annual' => 'Semi-annual', 'annual' => 'Annual' }.fetch(frequency, 'Instalment')
    end

    def present_amortisation_row(row)
      presented = {
        month: row[:month],
        payment: to_money(row[:payment]),
        interest: to_money(row[:interest]),
        principal: to_money(row[:principal]),
        balance: to_money(row[:balance])
      }
      presented[:due_date] = row[:due_date] if row[:due_date]
      presented
    end

    # Integer exponentiation on BigDecimal with a generous working precision.
    def power(base, exponent)
      base.power(exponent, 32)
    end

    def round_money(value)
      to_decimal(value).round(SCALE, BigDecimal::ROUND_HALF_UP)
    end

    def to_money(value)
      round_money(value).to_f
    end

    def to_number(value)
      decimal = to_decimal(value)
      decimal.frac.zero? ? decimal.to_i : decimal.round(4).to_f
    end

    def ratio(numerator, denominator)
      return 0.0 if to_decimal(denominator).zero?

      (to_decimal(numerator) / to_decimal(denominator)).round(4).to_f
    end

    def percent_of(part, whole)
      return 0.0 if to_decimal(whole).zero?

      ((to_decimal(part) / to_decimal(whole)) * HUNDRED).round(2).to_f
    end

    def to_decimal(value)
      case value
      when BigDecimal then value
      when Integer    then BigDecimal(value)
      when String then BigDecimal(value)
      when nil    then ZERO
      else
        # Float and anything else round-trip through their string form, which
        # is the only way to get an exact BigDecimal from a Float.
        BigDecimal(value.to_s)
      end
    end

    # --- validation ---------------------------------------------------------

    def validate_price!(price)
      value = numeric!(price, 'price')
      raise CalculationError.field('price', 'must be greater than zero') if value <= ZERO
      raise CalculationError.field('price', 'is unrealistically large') if value > MAX_PRICE

      value
    end

    def validate_percent!(percent, field)
      value = numeric!(percent, field)
      raise CalculationError.field(field, 'must be between 0 and 100') if value.negative? || value > HUNDRED

      value
    end

    def validate_years!(years)
      value = numeric!(years, 'years')
      raise CalculationError.field('years', 'must be a whole number of years') unless value.frac.zero?

      integer = value.to_i
      raise CalculationError.field('years', 'must be greater than zero') if integer <= 0
      raise CalculationError.field('years', "must not exceed #{MAX_YEARS}") if integer > MAX_YEARS

      integer
    end

    def validate_rate!(rate)
      value = numeric!(rate, 'annualRatePercent')
      raise CalculationError.field('annualRatePercent', 'must not be negative') if value.negative?
      raise CalculationError.field('annualRatePercent', "must not exceed #{MAX_RATE.to_i}") if value > MAX_RATE

      value
    end

    def validate_frequency!(frequency)
      value = frequency.to_s.strip.downcase
      value = DEFAULT_FREQUENCY if value.empty?
      unless FREQUENCIES.key?(value)
        raise CalculationError.field('frequency', "must be one of: #{FREQUENCIES.keys.join(', ')}")
      end

      value
    end

    def numeric!(value, field)
      raise CalculationError.field(field, 'is required') if value.nil? ||
                                                            (value.is_a?(String) && value.strip.empty?)

      case value
      when Numeric, BigDecimal then to_decimal(value)
      when String
        raise CalculationError.field(field, 'must be a number') unless value.strip.match?(/\A-?\d+(\.\d+)?\z/)

        BigDecimal(value.strip)
      else
        raise CalculationError.field(field, 'must be a number')
      end
    rescue ArgumentError, TypeError, FloatDomainError
      raise CalculationError.field(field, 'must be a number')
    end

    def coerce_date!(value, field)
      case value
      when Date then value
      when Time then value.to_date
      when String
        raise CalculationError.field(field, 'must be an ISO date (YYYY-MM-DD)') if value.strip.empty?

        Date.parse(value.strip)
      else
        raise CalculationError.field(field, 'must be an ISO date (YYYY-MM-DD)')
      end
    rescue ArgumentError, TypeError
      raise CalculationError.field(field, 'must be an ISO date (YYYY-MM-DD)')
    end
  end
end
