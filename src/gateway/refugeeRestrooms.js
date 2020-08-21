const fetch = require("node-fetch");

const BASE_URL = `https://www.refugerestrooms.org`;

async function searchRestroomsByLatLon(latitude, longitude, isFilterByADA, isFilterByUnisex, isFilterByChangingTable) {
    const URL = `${BASE_URL}/api/v1/restrooms/by_location?page=1&per_page=10&offset=0&ada=${isFilterByADA}&unisex=${isFilterByUnisex}&lat=${latitude}&lng=${longitude}`;
    console.log(`Endpoint ${URL}`);

    var restroomsArray = [];
    try {
        const response = await fetch(URL);
        restroomsArray = await response.json();
    } catch (error) {
        console.log(error);
    }

    if (isFilterByChangingTable) {
        restroomsArray = restroomsArray.filter((value) => { return value.changing_table; });
    }
    return restroomsArray;
}

module.exports = {
    BASE_URL: BASE_URL,
    searchRestroomsByLatLon: searchRestroomsByLatLon,
};