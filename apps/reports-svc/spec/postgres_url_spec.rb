# frozen_string_literal: true

RSpec.describe Reports::PostgresUrl do
  it 'parses the contract DATABASE_URL and strips the Prisma-only ?schema param' do
    parsed = described_class.parse('postgresql://nawy:nawy_password@postgres:5432/nawy?schema=public')

    expect(parsed[:conn_opts]).to include(
      host: 'postgres', port: 5432, dbname: 'nawy', user: 'nawy', password: 'nawy_password'
    )
    expect(parsed[:conn_opts]).not_to have_key(:schema)
    expect(parsed[:search_path]).to eq('public')
  end

  it 'forwards libpq-safe parameters' do
    parsed = described_class.parse(
      'postgresql://u:p@db:5432/nawy?schema=public&sslmode=require&connect_timeout=9'
    )
    expect(parsed[:conn_opts][:sslmode]).to eq('require')
    expect(parsed[:conn_opts][:connect_timeout]).to eq(9)
  end

  it 'percent-decodes credentials' do
    parsed = described_class.parse('postgresql://na%40wy:p%40ss@db:5432/nawy')
    expect(parsed[:conn_opts][:user]).to eq('na@wy')
    expect(parsed[:conn_opts][:password]).to eq('p@ss')
  end

  it 'defaults the database name and port' do
    parsed = described_class.parse('postgres://user@db/')
    expect(parsed[:conn_opts][:dbname]).to eq('nawy')
    expect(parsed[:conn_opts][:port]).to eq(5432)
  end

  it 'tags the connection with an application name' do
    parsed = described_class.parse('postgresql://u:p@db:5432/nawy')
    expect(parsed[:conn_opts][:application_name]).to eq('nawy-reports-svc')
  end

  it 'rejects a non-postgres scheme' do
    expect { described_class.parse('mysql://u:p@db/nawy') }.to raise_error(ArgumentError)
  end
end
