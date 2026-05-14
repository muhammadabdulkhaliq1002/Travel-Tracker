import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { collection, doc, setDoc, updateDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { useAuth } from './AuthProvider';
import { compressImage } from '../lib/imageUtils';
import { useNavigate, Link, useParams } from 'react-router-dom';
import { ArrowLeft, Camera, Loader2, Image as ImageIcon, MapPin, Plus, Save, Edit2, X, Maximize2 } from 'lucide-react';
import clsx from 'clsx';
import { format } from 'date-fns';

interface TripForm {
  date: string;
  vehicleNumber: string;
  travellingFrom: string;
  travellingTo: string;
  startingOdometer: number;
  endingOdometer: number;
  perKmRate: number;
  purposeOfTravel: string;
  approvedBy: string;
  remarks: string;
  status: 'Pending' | 'Approved' | 'Rejected';
}

export function NewTrip() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const { id } = useParams();
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(!!id);
  const [startImg, setStartImg] = useState<string | null>(null);
  const [endImg, setEndImg] = useState<string | null>(null);
  const [processingImage, setProcessingImage] = useState<'start' | 'end' | null>(null);
  const [previewModal, setPreviewModal] = useState<string | null>(null);
  const [startLocation, setStartLocation] = useState<{lat: number, lng: number} | null>(null);
  const [endLocation, setEndLocation] = useState<{lat: number, lng: number} | null>(null);
  const [fetchingLocation, setFetchingLocation] = useState<'start' | 'end' | null>(null);

  const isEdit = !!id;

  const { register, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm<TripForm>({
    defaultValues: {
      date: format(new Date(), 'yyyy-MM-dd'),
      perKmRate: 7, // From the specimen PDF
      startingOdometer: 0,
      endingOdometer: 0,
      status: 'Pending',
    }
  });

  const startingOdo = watch('startingOdometer');
  const endingOdo = watch('endingOdometer');
  const perKmRate = watch('perKmRate');
  
  const distanceTravelled = Math.max(0, Number(endingOdo) - Number(startingOdo));
  const amount = distanceTravelled * Number(perKmRate);

  useEffect(() => {
    if (id) {
      const fetchTrip = async () => {
        try {
          const docRef = doc(db, 'trips', id);
          const docSnap = await getDoc(docRef);
          
          if (docSnap.exists()) {
            const data = docSnap.data();
            reset({
              date: data.date,
              vehicleNumber: data.vehicleNumber,
              travellingFrom: data.travellingFrom,
              travellingTo: data.travellingTo,
              startingOdometer: data.startingOdometer,
              endingOdometer: data.endingOdometer,
              perKmRate: data.perKmRate,
              purposeOfTravel: data.purposeOfTravel || '',
              approvedBy: data.approvedBy || '',
              remarks: data.remarks || '',
              status: data.status || 'Pending'
            });
            setStartImg(data.startOdometerImageUri || null);
            setEndImg(data.endOdometerImageUri || null);
            setStartLocation(data.startLocation || null);
            setEndLocation(data.endLocation || null);
          } else {
            alert("Trip record not found.");
            navigate('/');
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, `trips/${id}`);
        } finally {
          setLoading(false);
        }
      };
      fetchTrip();
    }
  }, [id, reset, navigate]);

  const handleLocationFetch = (type: 'start' | 'end', populateField?: string) => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser');
      return;
    }
    setFetchingLocation(type);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        if (type === 'start') {
          setStartLocation({ lat: latitude, lng: longitude });
          if (populateField === 'travellingFrom') {
            try {
              const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`);
              if (res.ok) {
                const data = await res.json();
                if (data && data.display_name) {
                  // Keep it concise, e.g. city/suburb if available, else display_name
                  const address = data.address?.suburb || data.address?.city || data.address?.town || data.address?.village || data.display_name.split(',').slice(0, 2).join(',');
                  setValue('travellingFrom', address);
                }
              } else {
                setValue('travellingFrom', `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
              }
            } catch (e) {
              setValue('travellingFrom', `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
            }
          }
        } else {
          setEndLocation({ lat: latitude, lng: longitude });
        }
        setFetchingLocation(null);
      },
      (error) => {
        let errorMsg = 'Error fetching location';
        if (error.code === error.PERMISSION_DENIED) errorMsg = 'Location permission denied. Please allow location access in your browser settings.';
        alert(errorMsg);
        setFetchingLocation(null);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleImageCapture = async (e: React.ChangeEvent<HTMLInputElement>, type: 'start' | 'end') => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setProcessingImage(type);
    try {
      const base64 = await compressImage(file);
      if (type === 'start') setStartImg(base64);
      else setEndImg(base64);
    } catch (err) {
      alert("Error capturing image. Please try again.");
    } finally {
      setProcessingImage(null);
      // Reset input value so the same file could be selected again if needed
      e.target.value = '';
    }
  };

  const onSubmit = async (data: TripForm) => {
    if (!user) return;
    
    if (Number(data.endingOdometer) < Number(data.startingOdometer)) {
      alert("Ending Odometer must be greater than or equal to Starting Odometer.");
      return;
    }

    setSubmitting(true);
    try {
      const tripRef = id ? doc(db, 'trips', id) : doc(collection(db, 'trips'));
      const tripData: any = {
        date: data.date,
        vehicleNumber: data.vehicleNumber,
        travellingFrom: data.travellingFrom,
        travellingTo: data.travellingTo,
        startingOdometer: Number(data.startingOdometer),
        endingOdometer: Number(data.endingOdometer),
        distanceTravelled,
        perKmRate: Number(data.perKmRate),
        amount,
        status: data.status,
        purposeOfTravel: data.purposeOfTravel,
        approvedBy: data.approvedBy,
        remarks: data.remarks,
        startOdometerImageUri: startImg || '',
        endOdometerImageUri: endImg || '',
        startLocation: startLocation,
        endLocation: endLocation,
        updatedAt: serverTimestamp()
      };

      if (!id) {
        tripData.userId = user.uid;
        tripData.userEmail = user.email;
        tripData.userDisplayName = user.displayName;
        tripData.createdAt = serverTimestamp();
      }

      // Clean empty strings so we don't send optional fields as empty strings if we don't want to
      const cleanData = Object.fromEntries(
        Object.entries(tripData).filter(([_, v]) => v !== '')
      );

      if (id) {
        await updateDoc(tripRef, cleanData);
      } else {
        await setDoc(tripRef, cleanData);
        if (profile?.managerId) {
          const notificationRef = doc(collection(db, 'notifications'));
          await setDoc(notificationRef, {
            userId: profile.managerId,
            tripId: tripRef.id,
            message: `${user.displayName || user.email} submitted a new trip from ${data.travellingFrom} to ${data.travellingTo}.`,
            read: false,
            link: `/edit/${tripRef.id}`,
            createdAt: serverTimestamp()
          });
        }
      }
      
      navigate('/');
    } catch (error) {
      handleFirestoreError(error, id ? OperationType.UPDATE : OperationType.CREATE, `trips/${id || 'new'}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <div className="sticky top-0 z-10 w-full shrink-0 flex flex-col shadow-sm">
        <div className="bg-slate-900 text-slate-300 text-[10px] sm:text-xs font-bold py-1 px-4 sm:px-8 text-center tracking-widest uppercase">
          Goodfarmer Food Concepts Private Limited
        </div>
        <header className="h-16 bg-white border-b border-slate-200 flex items-center px-4 sm:px-8">
          <Link to="/" className="p-2 -ml-2 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-100 transition mr-2">
            <ArrowLeft size={20} />
          </Link>
          <h2 className="text-slate-800 font-semibold text-lg">Travel Tracker</h2>
        </header>
      </div>

      <div className="flex-1 p-4 sm:p-8 flex justify-center pb-24">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 className="animate-spin text-blue-600" size={40} />
            <p className="text-slate-500 font-medium">Fetching record...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="w-full max-w-lg mb-8 space-y-6">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xl p-4 sm:p-6 flex flex-col">
              <h3 className="text-slate-900 font-bold mb-5 flex items-center gap-2 text-lg">
                {isEdit ? <Edit2 size={20} className="text-blue-600" /> : <Plus size={20} className="text-blue-600" />}
                {isEdit ? 'Edit Trip Record' : 'New Trip Record'}
              </h3>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[11px] font-bold text-slate-500 uppercase mb-1 block">Date</label>
                  <input type="date" {...register('date', { required: true })} className="w-full border border-slate-200 rounded-lg p-2.5 bg-slate-50 text-slate-800 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition" />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-500 uppercase mb-1 block">Vehicle Reg.</label>
                  <input type="text" placeholder="KA28X1167" {...register('vehicleNumber', { required: true })} className="w-full border border-slate-200 rounded-lg p-2.5 bg-slate-50 text-slate-800 text-sm uppercase focus:ring-2 focus:ring-blue-500 outline-none transition" />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase mb-1 block">From</label>
                <div className="relative">
                  <input type="text" placeholder="Central Kitchen" {...register('travellingFrom', { required: true })} className="w-full border border-slate-200 rounded-lg p-2.5 bg-slate-50 text-slate-800 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition pr-10" />
                  <button type="button" onClick={() => handleLocationFetch('start', 'travellingFrom')} disabled={fetchingLocation === 'start'} className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-blue-600 hover:bg-blue-50 rounded-md transition-colors" title="Use current location">
                    {fetchingLocation === 'start' ? <Loader2 size={16} className="animate-spin" /> : <MapPin size={16} />}
                  </button>
                </div>
              </div>
              
              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase mb-1 block">To</label>
                <input type="text" placeholder="Ulsoor" {...register('travellingTo', { required: true })} className="w-full border border-slate-200 rounded-lg p-2.5 bg-slate-50 text-slate-800 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition" />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase mb-1 block">Purpose of Travel</label>
                <input type="text" placeholder="e.g. Client meeting" {...register('purposeOfTravel')} className="w-full border border-slate-200 rounded-lg p-2.5 bg-slate-50 text-slate-800 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition" />
              </div>

              <div className="grid grid-cols-2 gap-4 pt-2">
                <div>
                  <label className="text-[11px] font-bold text-slate-500 uppercase mb-1 block">Start Reading</label>
                  <input type="number" {...register('startingOdometer', { required: true })} className="w-full border border-slate-200 rounded-lg p-2.5 bg-slate-50 text-slate-800 text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none transition" />
                  <div className="mt-2 text-left">
                    {startLocation ? (
                       <div className="flex items-center text-[10px] text-green-600 font-medium">
                         <MapPin size={12} className="mr-1" />
                         Location saved ({startLocation.lat.toFixed(4)}, {startLocation.lng.toFixed(4)})
                       </div>
                    ) : (
                      <button type="button" onClick={() => handleLocationFetch('start')} disabled={fetchingLocation === 'start'} className="flex items-center text-[10px] text-blue-600 font-medium hover:underline focus:outline-none">
                        {fetchingLocation === 'start' ? <Loader2 size={12} className="mr-1 animate-spin" /> : <MapPin size={12} className="mr-1" />}
                        Fetch Start Location
                      </button>
                    )}
                  </div>
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-500 uppercase mb-1 block">End Reading</label>
                  <input type="number" {...register('endingOdometer', { required: true })} className="w-full border border-slate-200 rounded-lg p-2.5 bg-slate-50 text-slate-800 text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none transition" />
                  <div className="mt-2 text-left">
                    {endLocation ? (
                       <div className="flex items-center text-[10px] text-green-600 font-medium">
                         <MapPin size={12} className="mr-1" />
                         Location saved ({endLocation.lat.toFixed(4)}, {endLocation.lng.toFixed(4)})
                       </div>
                    ) : (
                      <button type="button" onClick={() => handleLocationFetch('end')} disabled={fetchingLocation === 'end'} className="flex items-center text-[10px] text-blue-600 font-medium hover:underline focus:outline-none">
                        {fetchingLocation === 'end' ? <Loader2 size={12} className="mr-1 animate-spin" /> : <MapPin size={12} className="mr-1" />}
                        Fetch End Location
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[11px] font-bold text-slate-500 uppercase mb-1 block">Start Odo Snap</label>
                  <label className="relative w-full rounded-lg border-2 border-dashed border-slate-200 bg-slate-50 flex flex-col items-center justify-center p-2 cursor-pointer hover:border-blue-500 transition group min-h-[120px] overflow-hidden">
                    {processingImage === 'start' ? (
                      <div className="flex flex-col items-center justify-center space-y-2 py-4">
                        <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
                        <span className="text-[10px] text-slate-500 font-medium animate-pulse">Processing...</span>
                      </div>
                    ) : startImg ? (
                      <div className="relative w-full flex flex-col items-center justify-center h-full">
                        <img src={startImg} className="h-32 w-full object-cover rounded shadow-sm border border-slate-200" alt="Start Odo" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3 rounded">
                          <button type="button" onClick={(e) => { e.preventDefault(); setPreviewModal(startImg); }} className="p-2 bg-white/20 hover:bg-white/40 rounded-full text-white backdrop-blur-sm transition">
                            <Maximize2 size={16} />
                          </button>
                          <div className="p-2 bg-white/20 rounded-full text-white backdrop-blur-sm">
                            <Camera size={16} />
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center py-4">
                        <ImageIcon className="w-6 h-6 text-slate-400 group-hover:text-blue-500 mb-2 transition-colors" />
                        <span className="text-[11px] text-slate-400 font-medium">Capture/Upload</span>
                      </div>
                    )}
                    <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handleImageCapture(e, 'start')} disabled={processingImage === 'start'} />
                  </label>
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-500 uppercase mb-1 block">End Odo Snap</label>
                  <label className="relative w-full rounded-lg border-2 border-dashed border-slate-200 bg-slate-50 flex flex-col items-center justify-center p-2 cursor-pointer hover:border-blue-500 transition group min-h-[120px] overflow-hidden">
                    {processingImage === 'end' ? (
                      <div className="flex flex-col items-center justify-center space-y-2 py-4">
                        <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
                        <span className="text-[10px] text-slate-500 font-medium animate-pulse">Processing...</span>
                      </div>
                    ) : endImg ? (
                      <div className="relative w-full flex flex-col items-center justify-center h-full">
                        <img src={endImg} className="h-32 w-full object-cover rounded shadow-sm border border-slate-200" alt="End Odo" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3 rounded">
                          <button type="button" onClick={(e) => { e.preventDefault(); setPreviewModal(endImg); }} className="p-2 bg-white/20 hover:bg-white/40 rounded-full text-white backdrop-blur-sm transition">
                            <Maximize2 size={16} />
                          </button>
                          <div className="p-2 bg-white/20 rounded-full text-white backdrop-blur-sm">
                            <Camera size={16} />
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center py-4">
                        <ImageIcon className="w-6 h-6 text-slate-400 group-hover:text-blue-500 mb-2 transition-colors" />
                        <span className="text-[11px] text-slate-400 font-medium">Capture/Upload</span>
                      </div>
                    )}
                    <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handleImageCapture(e, 'end')} disabled={processingImage === 'end'} />
                  </label>
                </div>
              </div>

              <div className="p-4 bg-slate-100 rounded-xl mt-4 space-y-4">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-500 font-medium">Distance Travelled</span>
                  <span className="font-mono text-slate-800 font-bold">{distanceTravelled} km</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-500 font-medium pt-1">Rate (₹/km)</span>
                  <input type="number" step="0.1" {...register('perKmRate', { required: true })} className="w-20 border border-slate-200 rounded flex-shrink-0 p-1 text-sm bg-white text-right font-mono outline-none focus:ring-1 focus:ring-blue-500" />
                </div>
                <div className="border-t border-slate-200 pt-3 flex justify-between items-center">
                  <span className="text-sm font-bold text-slate-800">Total Amount</span>
                  <span className="text-lg font-bold text-blue-600 font-mono">₹{amount.toFixed(2)}</span>
                </div>
              </div>

              <div className="space-y-4 pt-4 border-t border-slate-100">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Optional Details</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[11px] font-bold text-slate-500 uppercase mb-1 block text-blue-600">Status</label>
                    <select {...register('status')} className="w-full border border-slate-200 rounded-lg p-2.5 bg-slate-50 text-slate-800 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition font-medium appearance-none">
                      <option value="Pending">Pending</option>
                      <option value="Approved">Approved</option>
                      <option value="Rejected">Rejected</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-500 uppercase mb-1 block">Approver</label>
                    <input type="text" placeholder="Ram Sir" {...register('approvedBy')} className="w-full border border-slate-200 rounded-lg p-2.5 bg-slate-50 text-slate-800 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition" />
                  </div>
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-500 uppercase mb-1 block">Remarks</label>
                  <input type="text" placeholder="Optional notes" {...register('remarks')} className="w-full border border-slate-200 rounded-lg p-2.5 bg-slate-50 text-slate-800 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition" />
                </div>
              </div>
            </div>
          </div>

          <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-slate-200 sm:relative sm:bg-transparent sm:border-0 sm:p-0 z-20">
            <button 
              type="submit" 
              disabled={submitting}
              className="w-full max-w-lg mx-auto sm:w-full bg-slate-900 text-white py-3.5 rounded-xl font-bold shadow-lg shadow-slate-300 hover:bg-black transition-colors disabled:opacity-75 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <Loader2 className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" />
                  {isEdit ? 'Updating Record...' : 'Saving to Database...'}
                </>
              ) : (
                <>
                  {isEdit ? <Save size={20} /> : null}
                  {isEdit ? 'Update Record' : 'Save to Database'}
                </>
              )}
            </button>
          </div>
        </form>
        )}
      </div>

      {previewModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/90 p-4 sm:p-8 animate-in fade-in" onClick={() => setPreviewModal(null)}>
          <button
            title="Close"
            className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors"
            onClick={() => setPreviewModal(null)}
          >
            <X size={24} />
          </button>
          <img
            src={previewModal}
            alt="Odometer Preview"
            className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
