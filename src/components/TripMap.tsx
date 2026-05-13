import { useEffect, useRef, useState } from 'react';
import { useMap, useMapsLibrary, Map, APIProvider } from '@vis.gl/react-google-maps';

function RouteDisplay({ origin, destination }: { origin: string; destination: string }) {
  const map = useMap();
  const routesLib = useMapsLibrary('routes');
  const polylinesRef = useRef<google.maps.Polyline[]>([]);

  useEffect(() => {
    if (!routesLib || !map) return;
    
    // Clear previous route
    polylinesRef.current.forEach(p => p.setMap(null));
    polylinesRef.current = [];

    if (!origin || !destination) return;

    routesLib.Route.computeRoutes({
      origin,
      destination,
      travelMode: 'DRIVING',
      fields: ['path', 'distanceMeters', 'durationMillis', 'viewport'],
    }).then(({ routes }) => {
      if (routes && routes?.[0]) {
        const newPolylines = routes[0].createPolylines();
        newPolylines.forEach((p: any) => p.setMap(map));
        polylinesRef.current = newPolylines;
        if (routes[0].viewport) map.fitBounds(routes[0].viewport);
      }
    }).catch(err => {
      console.error("Routing error:", err);
    });

    return () => polylinesRef.current.forEach(p => p.setMap(null));
  }, [routesLib, map, origin, destination]);

  return null;
}

const API_KEY = process.env.GOOGLE_MAPS_PLATFORM_KEY || '';
const hasValidKey = Boolean(API_KEY) && API_KEY !== 'YOUR_API_KEY';

export function TripMapModal({ 
  isOpen, 
  onClose, 
  from, 
  to 
}: { 
  isOpen: boolean; 
  onClose: () => void;
  from: string;
  to: string;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl overflow-hidden flex flex-col h-[80vh]">
        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-white z-10 shadow-sm relative">
          <h3 className="font-bold text-slate-800">Trip Route</h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200">
            &times;
          </button>
        </div>
        <div className="flex-1 w-full bg-slate-50 relative">
          {!hasValidKey ? (
             <div className="absolute inset-0 flex items-center justify-center p-6 bg-slate-50 z-20">
               <div className="text-center max-w-sm">
                 <h2 className="text-lg font-bold text-slate-800 mb-2">Google Maps Key Required</h2>
                 <p className="text-sm text-slate-600 mb-4">To view maps, please add your Google Maps Platform API key.</p>
                 <ul className="text-xs text-left text-slate-500 space-y-2 list-disc pl-5 bg-white p-4 rounded-xl border border-slate-200">
                   <li>Open Settings (gear icon, top-right)</li>
                   <li>Select Secrets</li>
                   <li>Add <code className="bg-slate-100 px-1 rounded text-slate-700">GOOGLE_MAPS_PLATFORM_KEY</code></li>
                 </ul>
               </div>
             </div>
          ) : (
            <APIProvider apiKey={API_KEY} version="weekly">
              <Map
                defaultCenter={{lat: 12.9716, lng: 77.5946}} // Default to Bangalore roughly based on sample data
                defaultZoom={11}
                mapId="TRIP_MAP_ID"
                internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
                style={{width: '100%', height: '100%'}}
              >
                <RouteDisplay origin={from} destination={to} />
              </Map>
            </APIProvider>
          )}
        </div>
        <div className="p-4 bg-white border-t border-slate-100 flex items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full border border-blue-500 bg-white"></div>
            <span className="font-medium text-slate-700 truncate max-w-[150px] sm:max-w-[200px]">{from}</span>
          </div>
          <span className="text-slate-300">&rarr;</span>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-red-500 border border-red-500"></div>
            <span className="font-medium text-slate-700 truncate max-w-[150px] sm:max-w-[200px]">{to}</span>
          </div>
        </div>
      </div>
    </div>
  );
}