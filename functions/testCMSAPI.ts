export default async function testCMSAPI() {
    const res = await fetch('https://data.cms.gov/api/1/metastore/schemas/dataset/items');
    return await res.json();
}