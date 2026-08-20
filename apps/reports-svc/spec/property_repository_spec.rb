# frozen_string_literal: true

# `PropertyRepository.find` is documented as accepting a UUID, a Mongo
# ObjectId, a slug or a reference number. Three of those worked; the UUID
# clause matched a top-level `id` field, which a property document does not
# have, so it silently never fired and every lookup-by-UUID 404'd.
#
# These assert the shape of the query rather than the result, because that is
# where the bug was: the repository was asking Mongo a question no document
# could ever answer.
RSpec.describe Reports::Repositories::PropertyRepository do
  let(:collection) { instance_double('Mongo::Collection') }
  let(:view) { instance_double('Mongo::Collection::View') }
  let(:captured) { [] }

  before do
    allow(described_class).to receive(:collection).and_return(collection)
    allow(collection).to receive(:find) do |filter|
      captured << filter
      view
    end
    allow(view).to receive(:limit).and_return(view)
    allow(view).to receive(:first).and_return(nil)
  end

  def fields_matched
    captured.last['$or'].flat_map(&:keys)
  end

  it 'looks a UUID up by propertyId, the field the documents actually carry' do
    described_class.find(SpecSupport::Fixtures::PROPERTY_ID)

    expect(fields_matched).to include('propertyId')
  end

  it 'never matches on a bare `id`, which no property document has' do
    described_class.find(SpecSupport::Fixtures::PROPERTY_ID)

    expect(fields_matched).not_to include('id')
  end

  it 'still accepts a slug, a reference number and an ObjectId' do
    described_class.find('palm-hills-new-cairo-3br-apartment-tc-1042')

    expect(fields_matched).to include('slug', 'referenceNo', '_id')
  end

  it 'normalises case so TC-1042 and tc-1042 find the same property' do
    described_class.find('tc-1042')

    reference = captured.last['$or'].find { |c| c.key?('referenceNo') }
    expect(reference['referenceNo']).to eq('TC-1042')
  end

  it 'excludes soft-deleted properties' do
    described_class.find(SpecSupport::Fixtures::PROPERTY_ID)

    expect(captured.last['deletedAt']).to be_nil
    expect(captured.last).to have_key('deletedAt')
  end

  it 'returns nil for a blank identifier without touching Mongo' do
    expect(described_class.find('   ')).to be_nil
    expect(captured).to be_empty
  end
end
