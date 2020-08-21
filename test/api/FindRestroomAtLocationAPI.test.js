const unitUnderTest = require("../../src/index");
const utilities = require("../../src/utilities");

const expect = require("chai").expect;
const decache = require("decache");

const context = {};

describe("FindRestroomAtLocation API handler tests", function () {
  afterEach(function () {
    decache("../test-data/api/atlocation_api");
  });

  it("should delegate to skill with the right resolved search filters and zipcode loaded into session attributes", async () => {
    const event = require("../../test-data/api/atlocation_api");

    const synonymsToIdMap = utilities.slotSynonymsToIdMap("RestRoomTypes");
    const allSynonyms = [...synonymsToIdMap.keys()];

    for (var i = 0; i < 1000; i++) {
      // Simulate 0 to 3 search filters randomly.
      const randomTestSetSize = Math.floor(Math.random() * Math.floor(4));
      // Simulate a zipcode.
      const zipcode = 10000 + Math.floor(Math.random() * Math.floor(89999));

      const aTestSetOfSynonyms = getRandom(allSynonyms, randomTestSetSize);

      let expectedResolvedEntitiesSet = new Set();
      aTestSetOfSynonyms.forEach(synonym =>
        expectedResolvedEntitiesSet = expectedResolvedEntitiesSet.add(synonymsToIdMap.get(synonym))
      )

      event.request.apiRequest.arguments.SearchFiltersList = aTestSetOfSynonyms;
      event.request.apiRequest.arguments.Zipcode = zipcode;

      const responseContainer = await unitUnderTest.handler(event, context);
      const response = responseContainer.response;
      const directive = response.directives[0];
      expect(directive.type).to.equal(`Dialog.DelegateRequest`);
      expect(directive.target).to.equal(`skill`);
      expect(directive.period.until).to.equal(`EXPLICIT_RETURN`);
      expect(directive.updatedRequest.type).to.equal(`IntentRequest`);
      expect(directive.updatedRequest.intent.name).to.equal(`FindRestroomAtLocationIntent`);

      const actualResolvedEntitiesArray = context.search_filters;
      const expectedResolvedEntitiesArray = [...expectedResolvedEntitiesSet];

      expect(actualResolvedEntitiesArray).to.eql(expectedResolvedEntitiesArray);

      expect(context.zipcode).to.equal(zipcode);
    }
  });

  it("should delegate to skill even when the zipcode is missing. We expiclity set a zipcode to null in the intent slots", async () => {
    const event = require("../../test-data/api/atlocation_api");

    const synonymsToIdMap = utilities.slotSynonymsToIdMap("RestRoomTypes");
    const allSynonyms = [...synonymsToIdMap.keys()];
    const aTestSetOfSynonyms = getRandom(allSynonyms, 3);

    event.request.apiRequest.arguments.SearchFiltersList = aTestSetOfSynonyms;
    delete event.request.apiRequest.arguments.Zipcode;

    await unitUnderTest.handler(event, context);

    expect(context.zipcode).to.equal(null);
  });
});

/**
 * Helper method to fetch n random elements from an array.
 */
function getRandom(array, n) {
  var result = new Array(n),
    len = array.length,
    taken = new Array(len);
  if (n > len)
    throw new RangeError("getRandom: more elements taken than available");
  while (n--) {
    var x = Math.floor(Math.random() * len);
    result[n] = array[x in taken ? taken[x] : x];
    taken[x] = --len in taken ? taken[len] : len;
  }
  return result;
}