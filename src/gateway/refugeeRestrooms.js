const fetch = require("node-fetch");

async function searchRestroomsByLatLon() {
    const latitude = -6.5909745;
    const longitude = 106.7986648;
    const URL = `https://www.refugerestrooms.org/api/v1/restrooms/by_location?page=1&per_page=10&offset=0&lat=${latitude}&lng=${longitude}`;
    console.log(`Endpoint ${URL}`);

    var restroomsArray;
    try {
        const response = await fetch(URL);
        restroomsArray = await response.json();
    } catch (error) {
        console.log(error);
    }

    await asyncForEach(restroomsArray, (restroom) => {
        console.log(JSON.stringify(restroom));
    });

    return restroomsArray;
}

async function asyncForEach(array, callback) {
    for (let index = 0; index < array.length; index++) {
        try {
            await callback(array[index], index, array);
        } catch (error) {
            console.log(error);
        }
    }
}

module.exports = {
    searchRestroomsByLatLon: searchRestroomsByLatLon
};