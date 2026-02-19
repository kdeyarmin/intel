// Approximate lat/lng for common PA ZIP code prefixes (3-digit)
// This gives reasonable placement without a geocoding API
const PA_ZIP_COORDS = {
  '150': [40.44, -80.00], // Pittsburgh
  '151': [40.44, -79.95],
  '152': [40.50, -79.85],
  '153': [40.30, -78.92], // Johnstown
  '154': [40.50, -78.40], // Altoona
  '155': [40.50, -78.40],
  '156': [40.18, -79.56], // Greensburg
  '157': [40.00, -79.05],
  '158': [41.23, -79.38], // Clarion
  '159': [40.90, -79.95],
  '160': [40.80, -79.95], // New Castle
  '161': [41.10, -80.08],
  '162': [41.40, -79.70],
  '163': [42.12, -80.08], // Erie
  '164': [41.96, -80.35],
  '165': [41.80, -79.15],
  '166': [40.85, -78.00],
  '167': [41.20, -78.73],
  '168': [41.47, -78.65],
  '169': [41.00, -77.85],
  '170': [40.27, -76.88], // Harrisburg
  '171': [40.27, -76.88],
  '172': [40.04, -76.30], // Lancaster
  '173': [39.96, -76.73], // York
  '174': [39.96, -76.73],
  '175': [40.34, -76.42],
  '176': [40.34, -75.93], // Reading
  '177': [40.70, -77.74],
  '178': [40.60, -75.49], // Allentown
  '179': [40.60, -75.49],
  '180': [40.60, -75.49], // Lehigh Valley
  '181': [40.60, -75.38],
  '182': [41.24, -75.88], // Scranton/Wilkes-Barre
  '183': [41.24, -75.88],
  '184': [41.40, -75.66],
  '185': [41.24, -75.88],
  '186': [41.24, -75.88],
  '187': [41.95, -75.16],
  '188': [40.92, -75.98],
  '189': [40.12, -75.34], // Philadelphia suburbs
  '190': [39.95, -75.17], // Philadelphia
  '191': [39.95, -75.17],
  '192': [39.95, -75.17],
  '193': [39.97, -75.13],
  '194': [40.10, -75.28], // Norristown
  '195': [40.34, -75.00], // Doylestown
  '196': [39.87, -75.52], // Chester/Media
};

// City-based fallback coordinates for PA
const PA_CITY_COORDS = {
  'philadelphia': [39.95, -75.17],
  'pittsburgh': [40.44, -80.00],
  'allentown': [40.60, -75.49],
  'erie': [42.13, -80.09],
  'reading': [40.34, -75.93],
  'scranton': [41.41, -75.66],
  'bethlehem': [40.63, -75.37],
  'lancaster': [40.04, -76.31],
  'harrisburg': [40.27, -76.88],
  'york': [39.96, -76.73],
  'wilkes-barre': [41.25, -75.88],
  'chester': [39.85, -75.36],
  'easton': [40.69, -75.22],
  'lebanon': [40.34, -76.42],
  'hazleton': [40.96, -75.97],
  'norristown': [40.12, -75.34],
  'pottstown': [40.25, -75.65],
  'state college': [40.79, -77.86],
  'williamsport': [41.24, -77.00],
  'chambersburg': [39.94, -77.66],
  'carlisle': [40.20, -77.19],
  'gettysburg': [39.83, -77.23],
  'bloomsburg': [41.00, -76.45],
  'media': [39.92, -75.39],
  'west chester': [39.96, -75.60],
  'doylestown': [40.31, -75.13],
  'newtown': [40.23, -74.93],
  'king of prussia': [40.09, -75.40],
  'ardmore': [40.00, -75.28],
  'bryn mawr': [40.02, -75.31],
  'wayne': [40.04, -75.39],
  'malvern': [40.04, -75.51],
  'conshohocken': [40.07, -75.30],
  'jenkintown': [40.09, -75.12],
  'abington': [40.12, -75.12],
  'levittown': [40.15, -74.83],
  'bensalem': [40.10, -74.95],
  'wyndmoor': [40.08, -75.19],
  'elkins park': [40.07, -75.13],
  'warminster': [40.19, -75.09],
  'lansdale': [40.24, -75.28],
  'quakertown': [40.44, -75.34],
  'sellersville': [40.35, -75.31],
  'danville': [40.96, -76.61],
  'sunbury': [40.86, -76.79],
  'lewisburg': [40.96, -76.88],
  'lock haven': [41.14, -77.45],
  'meadville': [41.64, -80.15],
  'oil city': [41.43, -79.70],
  'sharon': [41.23, -80.50],
  'new castle': [41.00, -80.35],
  'butler': [40.86, -79.90],
  'greensburg': [40.30, -79.54],
  'uniontown': [39.90, -79.72],
  'washington': [40.17, -80.25],
  'indiana': [40.62, -79.15],
  'altoona': [40.52, -78.39],
  'johnstown': [40.33, -78.92],
  'clearfield': [41.03, -78.43],
  'dubois': [41.12, -78.76],
  'st marys': [41.43, -78.56],
  'warren': [41.84, -79.14],
  'bradford': [41.96, -78.64],
  'towanda': [41.77, -76.44],
  'sayre': [41.98, -76.52],
  'stroudsburg': [41.00, -75.19],
  'east stroudsburg': [41.00, -75.18],
  'pottsville': [40.69, -76.19],
  'tamaqua': [40.80, -75.97],
  'shenandoah': [40.82, -76.20],
  'monroeville': [40.42, -79.79],
  'cranberry': [40.69, -80.10],
  'wexford': [40.63, -80.06],
  'moon township': [40.52, -80.22],
  'mckeesport': [40.35, -79.84],
  'bethel park': [40.33, -80.04],
  'bala cynwyd': [40.00, -75.23],
  'collegeville': [40.19, -75.45],
  'phoenixville': [40.13, -75.52],
  'coatesville': [39.98, -75.82],
  'downingtown': [40.01, -75.70],
  'exton': [40.03, -75.62],
  'paoli': [40.04, -75.48],
};

// State center coordinates for US states (fallback for non-PA)
const STATE_CENTERS = {
  'AL': [32.32, -86.90], 'AK': [63.59, -154.49], 'AZ': [34.05, -111.09],
  'AR': [35.20, -91.83], 'CA': [36.78, -119.42], 'CO': [39.55, -105.78],
  'CT': [41.60, -72.76], 'DE': [38.91, -75.53], 'FL': [27.66, -81.52],
  'GA': [32.17, -82.91], 'HI': [19.90, -155.58], 'ID': [44.07, -114.74],
  'IL': [40.63, -89.40], 'IN': [40.27, -86.13], 'IA': [41.88, -93.10],
  'KS': [39.01, -98.48], 'KY': [37.84, -84.27], 'LA': [30.98, -91.96],
  'ME': [45.25, -69.45], 'MD': [39.05, -76.64], 'MA': [42.41, -71.38],
  'MI': [44.31, -85.60], 'MN': [46.73, -94.69], 'MS': [32.35, -89.40],
  'MO': [37.96, -91.83], 'MT': [46.88, -110.36], 'NE': [41.49, -99.90],
  'NV': [38.80, -116.42], 'NH': [43.19, -71.57], 'NJ': [40.06, -74.41],
  'NM': [34.52, -105.87], 'NY': [43.30, -74.22], 'NC': [35.76, -79.02],
  'ND': [47.55, -101.00], 'OH': [40.42, -82.91], 'OK': [35.47, -97.52],
  'OR': [43.80, -120.55], 'PA': [41.20, -77.19], 'RI': [41.58, -71.48],
  'SC': [33.84, -81.16], 'SD': [43.97, -99.90], 'TN': [35.52, -86.58],
  'TX': [31.97, -99.90], 'UT': [39.32, -111.09], 'VT': [44.56, -72.58],
  'VA': [37.77, -78.17], 'WA': [47.75, -120.74], 'WV': [38.60, -80.45],
  'WI': [43.78, -88.79], 'WY': [43.08, -107.29], 'DC': [38.91, -77.04],
};

export function getProviderCoords(location) {
  if (!location) return null;

  // Try ZIP code first (most accurate)
  if (location.zip) {
    const zip3 = location.zip.substring(0, 3);
    if (PA_ZIP_COORDS[zip3]) {
      // Add small random offset so markers don't stack
      const [lat, lng] = PA_ZIP_COORDS[zip3];
      const offset = () => (Math.random() - 0.5) * 0.06;
      return [lat + offset(), lng + offset()];
    }
  }

  // Try city name
  if (location.city) {
    const cityKey = location.city.toLowerCase().trim();
    if (PA_CITY_COORDS[cityKey]) {
      const [lat, lng] = PA_CITY_COORDS[cityKey];
      const offset = () => (Math.random() - 0.5) * 0.04;
      return [lat + offset(), lng + offset()];
    }
  }

  // Fallback to state center
  if (location.state && STATE_CENTERS[location.state]) {
    const [lat, lng] = STATE_CENTERS[location.state];
    const offset = () => (Math.random() - 0.5) * 0.5;
    return [lat + offset(), lng + offset()];
  }

  return null;
}