/** Raw CMS fields use both column labels and snake/camel-case keys. */
export function isIdentifierField(key) {
  const normalized = String(key)
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_');
  return /(?:^|_)(?:id|identifier|code|cd|zip(?:code|4|5|9)?|postal|year|npi|ccn|fips|cbsa|tin|ein|upin|phone|telephone|fax)(?:_|$)/.test(normalized)
    || /(?:^|_)(?:provider|prov|prvdr|license|licence|certification|report|rpt_rec)_(?:number|num|nbr)(?:_|$)/.test(normalized);
}
