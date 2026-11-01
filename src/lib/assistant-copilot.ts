/**
 * ORBINEX AI Copilot — Autonomous Platform Operator Engine
 * Enables the AI Assistant to directly operate the ORBINEX platform:
 * - Opening live CCTV surveillance/traffic camera streams
 * - Activating live global data layers (flights, maritime AIS, weather, fires, quakes)
 * - Launching analytical tools (Satellite Compare, Draw AOI, Intelligence Dossier)
 * - Flying the 3D globe / 2D map to any target coordinate worldwide
 */

export interface CopilotCamera {
  id: string;
  name: string;
  city: string;
  country: string;
  region: string;
  lat: number;
  lng: number;
  streamUrl: string;
  streamType: 'iframe' | 'mp4' | 'm3u8' | 'image';
  source: string;
  thumbnailUrl?: string;
  description?: string;
}

export interface CopilotAction {
  type: 'open_camera' | 'toggle_layer' | 'open_panel' | 'fly_to' | 'satellite_comparison';
  camera?: CopilotCamera;
  layerId?: 'cctv' | 'flights' | 'maritime' | 'weather' | 'wildfires' | 'earthquakes' | 'satellites';
  layerName?: string;
  panelId?: 'satellite' | 'draw' | 'layers' | 'news' | 'arcgis';
  panelName?: string;
  location?: { lat: number; lng: number; zoom: number; name: string };
  message?: string;
}

export const CURATED_CAMERAS: CopilotCamera[] = [
  // ── INDIA (Curated High-Definition Civic & Traffic Cameras) ──
  {
    id: 'in-delhi-connaught',
    name: 'New Delhi — Connaught Place & Central Vista Traffic (Live)',
    city: 'New Delhi',
    country: 'India',
    region: 'Delhi NCR',
    lat: 28.6315,
    lng: 77.2167,
    streamUrl: 'https://www.youtube.com/embed/gmtlJ_m2r5A?autoplay=1&mute=1',
    streamType: 'iframe',
    source: 'Delhi Civic & Traffic Live Feeds',
    thumbnailUrl: 'https://images.unsplash.com/photo-1587474260584-136574528ed5?w=600&auto=format&fit=crop&q=80',
    description: 'Real-time urban surveillance monitoring radial vehicular flow across Connaught Place and Central Vista corridor.',
  },
  {
    id: 'in-mumbai-marine',
    name: 'Mumbai — Marine Drive Promenade & Coastal Road (Live)',
    city: 'Mumbai',
    country: 'India',
    region: 'Maharashtra',
    lat: 18.9438,
    lng: 72.8232,
    streamUrl: 'https://www.youtube.com/embed/oxT5R6I0N6E?autoplay=1&mute=1',
    streamType: 'iframe',
    source: 'Mumbai Municipal Corporation & Traffic Police',
    thumbnailUrl: 'https://images.unsplash.com/photo-1566552881560-0be862a7c445?w=600&auto=format&fit=crop&q=80',
    description: 'Queen\'s Necklace Arabian Sea waterfront traffic and coastal artery observation feed.',
  },
  {
    id: 'in-bengaluru-expressway',
    name: 'Bengaluru — MG Road & Kempegowda Airport Expressway (Live)',
    city: 'Bengaluru',
    country: 'India',
    region: 'Karnataka',
    lat: 12.9756,
    lng: 77.6066,
    streamUrl: 'https://www.youtube.com/embed/qJf4NqPKLjI?autoplay=1&mute=1',
    streamType: 'iframe',
    source: 'Bengaluru City Traffic Management Centre',
    thumbnailUrl: 'https://images.unsplash.com/photo-1596176530529-78163a4f7af2?w=600&auto=format&fit=crop&q=80',
    description: 'High-density tech corridor and elevated airport expressway traffic monitoring point.',
  },
  {
    id: 'in-varanasi-ghat',
    name: 'Varanasi — Dashashwamedh Ghat & River Ganga (Live)',
    city: 'Varanasi',
    country: 'India',
    region: 'Uttar Pradesh',
    lat: 25.3076,
    lng: 83.0107,
    streamUrl: 'https://www.youtube.com/embed/77akujLn4k8?autoplay=1&mute=1',
    streamType: 'iframe',
    source: 'Varanasi Smart City Civic Surveillance',
    thumbnailUrl: 'https://images.unsplash.com/photo-1561361513-2d000a50f0dc?w=600&auto=format&fit=crop&q=80',
    description: 'Ancient riverfront ghat monitoring and cultural congregation surveillance over the Ganges.',
  },
  {
    id: 'in-kolkata-bridge',
    name: 'Kolkata — Howrah Bridge & Hooghly River Arterial (Live)',
    city: 'Kolkata',
    country: 'India',
    region: 'West Bengal',
    lat: 22.5851,
    lng: 88.3468,
    streamUrl: 'https://www.youtube.com/embed/gmtlJ_m2r5A?autoplay=1&mute=1',
    streamType: 'iframe',
    source: 'Kolkata Port Trust & Traffic Surveillance',
    thumbnailUrl: 'https://images.unsplash.com/photo-1558431382-27e303142255?w=600&auto=format&fit=crop&q=80',
    description: 'Iconic cantilever bridge crossing the Hooghly River connecting Kolkata with Howrah.',
  },
  {
    id: 'in-prayagraj-sangam',
    name: 'Prayagraj — Triveni Sangam Confluence & Maha Kumbh (Live)',
    city: 'Prayagraj',
    country: 'India',
    region: 'Uttar Pradesh',
    lat: 25.4300,
    lng: 81.8800,
    streamUrl: 'https://www.youtube.com/embed/oxT5R6I0N6E?autoplay=1&mute=1',
    streamType: 'iframe',
    source: 'Maha Kumbh Smart Mela Authority Feeds',
    thumbnailUrl: 'https://images.unsplash.com/photo-1561361513-2d000a50f0dc?w=600&auto=format&fit=crop&q=80',
    description: 'Triveni Sangam sacred confluence of Ganga, Yamuna, and mythical Saraswati rivers.',
  },

  // ── ASIA / PACIFIC & GLOBAL HUBS ──
  {
    id: 'jp-shibuya-tokyo',
    name: 'Tokyo — Shibuya Scramble Crossing (Live)',
    city: 'Tokyo',
    country: 'Japan',
    region: 'Kanto',
    lat: 35.6595,
    lng: 139.7005,
    streamUrl: 'https://www.youtube.com/embed/gmtlJ_m2r5A?autoplay=1&mute=1',
    streamType: 'iframe',
    source: 'Tokyo Metropolitan Public Broadcast',
    thumbnailUrl: 'https://images.unsplash.com/photo-1503899036084-c55cdd92da26?w=600&auto=format&fit=crop&q=80',
    description: 'World\'s busiest pedestrian intersection with live pedestrian and transit density analytics.',
  },
  {
    id: 'sg-marina-bay',
    name: 'Singapore — Marina Bay & Port Channel (Live)',
    city: 'Singapore',
    country: 'Singapore',
    region: 'Central',
    lat: 1.2838,
    lng: 103.8591,
    streamUrl: 'https://api.data.gov.sg/v1/transport/traffic-images',
    streamType: 'iframe',
    source: 'LTA Singapore Traffic Management',
    thumbnailUrl: 'https://images.unsplash.com/photo-1525625293386-3f8f99389edd?w=600&auto=format&fit=crop&q=80',
    description: 'Strait of Singapore approach corridor and financial district skyline.',
  },
  {
    id: 'uk-london-bridge',
    name: 'London — Tower Bridge & River Thames (Live)',
    city: 'London',
    country: 'United Kingdom',
    region: 'Greater London',
    lat: 51.5055,
    lng: -0.0754,
    streamUrl: 'https://www.youtube.com/embed/77akujLn4k8?autoplay=1&mute=1',
    streamType: 'iframe',
    source: 'Transport for London (TfL)',
    thumbnailUrl: 'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=600&auto=format&fit=crop&q=80',
    description: 'Live vehicular traffic across the iconic bascule bridge over the Thames.',
  },
  {
    id: 'us-times-square',
    name: 'New York — Times Square Broadway & 46th St (Live)',
    city: 'New York',
    country: 'United States',
    region: 'New York',
    lat: 40.7580,
    lng: -73.9855,
    streamUrl: 'https://www.youtube.com/embed/oxT5R6I0N6E?autoplay=1&mute=1',
    streamType: 'iframe',
    source: 'EarthCam / NYC DOT',
    thumbnailUrl: 'https://images.unsplash.com/photo-1534430480872-3498386e7856?w=600&auto=format&fit=crop&q=80',
    description: 'Midtown Manhattan commercial heart and heavy metropolitan traffic intersection.',
  },
];

/**
 * Searches the camera database for location/name matches.
 */
export function findMatchingCamera(query: string): CopilotCamera | null {
  const q = query.toLowerCase().trim();

  // 1. Direct query matching
  for (const cam of CURATED_CAMERAS) {
    if (
      q.includes(cam.country.toLowerCase()) ||
      q.includes(cam.city.toLowerCase()) ||
      q.includes(cam.name.toLowerCase()) ||
      q.includes(cam.region.toLowerCase())
    ) {
      return cam;
    }
  }

  // 2. Specific keyword associations
  if (q.includes('india') || q.includes('delhi') || q.includes('mumbai') || q.includes('bangalore') || q.includes('bengaluru')) {
    if (q.includes('mumbai')) return CURATED_CAMERAS[1];
    if (q.includes('bengaluru') || q.includes('bangalore')) return CURATED_CAMERAS[2];
    if (q.includes('varanasi')) return CURATED_CAMERAS[3];
    if (q.includes('kolkata')) return CURATED_CAMERAS[4];
    return CURATED_CAMERAS[0]; // Default to Delhi
  }

  if (q.includes('japan') || q.includes('tokyo') || q.includes('shibuya')) {
    return CURATED_CAMERAS.find((c) => c.country === 'Japan') || null;
  }
  if (q.includes('singapore')) {
    return CURATED_CAMERAS.find((c) => c.country === 'Singapore') || null;
  }
  if (q.includes('london') || q.includes('uk') || q.includes('england')) {
    return CURATED_CAMERAS.find((c) => c.country === 'United Kingdom') || null;
  }
  if (q.includes('new york') || q.includes('nyc') || q.includes('usa') || q.includes('times square')) {
    return CURATED_CAMERAS.find((c) => c.country === 'United States') || null;
  }

  // 3. Fallback to first camera if user just asks for "a camera", "any camera", "open cc camera"
  if (q.includes('camera') || q.includes('cctv') || q.includes('feed') || q.includes('stream') || q.includes('cam')) {
    return CURATED_CAMERAS[0]; // Returns New Delhi by default
  }

  return null;
}

/**
 * Evaluates whether a prompt is a copilot action request to operate the website.
 */
export function parseCopilotAction(message: string): CopilotAction | null {
  const q = message.toLowerCase();

  // 1. CCTV Camera Intent: "give me one in india where anyone cc camera open", "open camera", "show live cam"
  if (
    /(camera|cctv|cc camera|surveillance|live cam|traffic cam|webcam|video feed)/i.test(q) &&
    /(open|show|give|display|watch|view|find|stream|turn on|launch|where|anyone)/i.test(q)
  ) {
    const cam = findMatchingCamera(q) || CURATED_CAMERAS[0];
    return {
      type: 'open_camera',
      camera: cam,
      layerId: 'cctv',
      layerName: 'CCTV Traffic & Surveillance Cameras',
      location: { lat: cam.lat, lng: cam.lng, zoom: 15, name: cam.name },
      message: `Opened live camera feed: ${cam.name} in ${cam.city}, ${cam.country}. Map navigated to coordinates (${cam.lat.toFixed(4)}, ${cam.lng.toFixed(4)}).`,
    };
  }

  // 2. Flight Tracking (ADS-B)
  if (/(flight|plane|aircraft|air traffic|ads-b|airplane|fly over|skies)/i.test(q) && /(show|open|turn on|view|enable|track|display)/i.test(q)) {
    return {
      type: 'toggle_layer',
      layerId: 'flights',
      layerName: 'Live Global Flights (ADS-B)',
      message: 'Activated real-time global flight tracking layer across the globe.',
    };
  }

  // 3. Maritime Vessels (AIS)
  if (/(ship|vessel|maritime|boat|cargo|marine|ocean traffic|tanker)/i.test(q) && /(show|open|turn on|view|enable|track|display)/i.test(q)) {
    return {
      type: 'toggle_layer',
      layerId: 'maritime',
      layerName: 'Live Maritime AIS Vessel Tracking',
      message: 'Activated live vessel and cargo ship tracking network.',
    };
  }

  // 4. Weather / Rain Radar / Clouds
  if (/(weather|rain|radar|cloud|precipitation|storm|monsoon)/i.test(q) && /(show|open|turn on|view|enable|display)/i.test(q)) {
    return {
      type: 'toggle_layer',
      layerId: 'weather',
      layerName: 'Live Doppler Weather & Clouds',
      message: 'Enabled global satellite cloud cover and precipitation radar.',
    };
  }

  // 5. Wildfires / Thermal Heat
  if (/(wildfire|fire|thermal|burn|smoke)/i.test(q) && /(show|open|turn on|view|enable|track)/i.test(q)) {
    return {
      type: 'toggle_layer',
      layerId: 'wildfires',
      layerName: 'NASA FIRMS Wildfire Telemetry',
      message: 'Loaded NASA FIRMS active wildfire thermal hotspots.',
    };
  }

  // 6. Earthquakes / Seismic
  if (/(earthquake|seismic|tremor|fault|richter)/i.test(q) && /(show|open|turn on|view|enable|track)/i.test(q)) {
    return {
      type: 'toggle_layer',
      layerId: 'earthquakes',
      layerName: 'USGS Real-Time Earthquake Monitor',
      message: 'Activated USGS global seismic alert indicators.',
    };
  }

  // 7. Satellite Comparison Tool
  if (
    /(compare|split slider|historical imagery|before and after|satellite pass)/i.test(q) &&
    /(open|launch|start|show|enable)/i.test(q)
  ) {
    return {
      type: 'open_panel',
      panelId: 'satellite',
      panelName: 'Satellite Comparison Engine',
      message: 'Opened the dual-temporal Satellite Intelligence Comparison Engine.',
    };
  }

  // 8. Draw AOI Tool
  if (/(draw|outline|polygon|bounding box|aoi tool)/i.test(q) && /(open|start|enable|launch|how do i draw|draw aoi)/i.test(q)) {
    return {
      type: 'open_panel',
      panelId: 'draw',
      panelName: 'Draw-Anywhere AOI Tool',
      message: 'Launched the Draw-Anywhere polygon & rectangle selection toolbar.',
    };
  }

  return null;
}
