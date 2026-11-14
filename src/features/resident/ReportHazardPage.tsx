
import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Camera,
  CheckCircle2,
  ChevronDown,
  Crosshair,
  Droplets,
  MapPin,
  ShieldCheck,
  Trash2,
  Upload,
} from 'lucide-react';
import { Link } from 'react-router-dom';

import { ResidentShell } from '../../components/layout/ResidentShell';
import { listActiveCommunities } from '../../services/residentService';
import type { Community, HazardCategory } from '../../types/resident';

const HAZARD_CATEGORIES: {
  value: HazardCategory;
  label: string;
  description: string;
}[] = [
  {
    value: 'flooded_road',
    label: 'Flooded road',
    description: 'Roads or streets covered by floodwater',
  },
  {
    value: 'rising_water_level',
    label: 'Rising water level',
    description: 'Water levels increasing in your area',
  },
  {
    value: 'blocked_drainage',
    label: 'Blocked drainage',
    description: 'Drainage channels blocked by waste or debris',
  },
  {
    value: 'overflowing_waterway',
    label: 'Overflowing waterway',
    description: 'Rivers, streams or canals overflowing',
  },
  {
    value: 'damaged_drainage',
    label: 'Damaged drainage',
    description: 'Broken or damaged drainage infrastructure',
  },
  {
    value: 'other',
    label: 'Other hazard',
    description: 'Another flood-related concern',
  },
];

const DESCRIPTION_MIN = 20;
const DESCRIPTION_MAX = 1000;
const PHOTO_MAX_SIZE = 5 * 1024 * 1024;

const inputClass =
  'w-full rounded-xl border border-border-soft bg-white px-4 py-3 text-sm text-brand-950 outline-none transition placeholder:text-slate-400 focus:border-brand-600 focus:ring-2 focus:ring-brand-600/10';

interface Coordinates {
  latitude: number;
  longitude: number;
}

export function ReportHazardPage() {
  const [communities, setCommunities] = useState<Community[]>([]);
  const [communitiesLoading, setCommunitiesLoading] = useState(true);
  const [communityError, setCommunityError] = useState('');

  const [communityId, setCommunityId] = useState('');
  const [category, setCategory] = useState<HazardCategory | ''>('');
  const [description, setDescription] = useState('');
  const [locationDetails, setLocationDetails] = useState('');

  const [coordinates, setCoordinates] = useState<Coordinates | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState('');

  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState('');
  const [photoError, setPhotoError] = useState('');

  const [submitError, setSubmitError] = useState('');
  const [demoSubmitted, setDemoSubmitted] = useState(false);

  useEffect(() => {
    let active = true;

    listActiveCommunities()
      .then((result) => {
        if (!active) return;
        setCommunities(result.filter((community) => community.isActive));
      })
      .catch((error: unknown) => {
        if (!active) return;

        setCommunityError(
          error instanceof Error
            ? error.message
            : 'Unable to load communities. Please try again.',
        );
      })
      .finally(() => {
        if (active) setCommunitiesLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  function handlePhotoChange(event: ChangeEvent<HTMLInputElement>) {
    const selectedFile = event.target.files?.[0];

    setPhotoError('');
    setSubmitError('');

    if (!selectedFile) return;

    if (!selectedFile.type.startsWith('image/')) {
      setPhotoError('Please select a valid image file.');
      event.target.value = '';
      return;
    }

    if (selectedFile.size > PHOTO_MAX_SIZE) {
      setPhotoError('Image must be 5 MB or smaller.');
      event.target.value = '';
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setPhoto(selectedFile);
        setPhotoPreview(reader.result);
      }
    };

    reader.onerror = () => {
      setPhotoError('Unable to preview this image. Please try another.');
    };

    reader.readAsDataURL(selectedFile);
  }

  function removePhoto() {
    setPhoto(null);
    setPhotoPreview('');
    setPhotoError('');

    const fileInput = document.getElementById(
      'hazard-photo',
    ) as HTMLInputElement | null;

    if (fileInput) fileInput.value = '';
  }

  function getCurrentLocation() {
    setLocationError('');

    if (!navigator.geolocation) {
      setLocationError('Your browser does not support location detection.');
      return;
    }

    setLocationLoading(true);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoordinates({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setLocationLoading(false);
      },
      (error) => {
        const message =
          error.code === error.PERMISSION_DENIED
            ? 'Location permission was denied. You can enter the location manually.'
            : error.code === error.POSITION_UNAVAILABLE
              ? 'Your current location is unavailable.'
              : 'Location request timed out. Please try again.';

        setLocationError(message);
        setLocationLoading(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 60000,
      },
    );
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError('');

    if (!communityId || !category) {
      setSubmitError('Please select a community and hazard category.');
      return;
    }

    if (description.trim().length < DESCRIPTION_MIN) {
      setSubmitError(
        `Please provide at least ${DESCRIPTION_MIN} characters describing the hazard.`,
      );
      return;
    }

    if (description.trim().length > DESCRIPTION_MAX) {
      setSubmitError(
        `Your description cannot exceed ${DESCRIPTION_MAX} characters.`,
      );
      return;
    }

    // Frontend demonstration only. No report is sent to a backend.
    setDemoSubmitted(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function resetForm() {
    setCommunityId('');
    setCategory('');
    setDescription('');
    setLocationDetails('');
    setCoordinates(null);
    setLocationError('');
    setPhoto(null);
    setPhotoPreview('');
    setPhotoError('');
    setSubmitError('');
    setDemoSubmitted(false);
  }

  const selectedCommunity = communities.find(
    (community) => community.id === communityId,
  );

  const selectedCategory = HAZARD_CATEGORIES.find(
    (item) => item.value === category,
  );

  return (
    <ResidentShell>
      <main className="mx-auto max-w-4xl px-4 py-8 md:px-8 md:py-12">
        <Link
          to="/"
          className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-text-secondary transition hover:text-brand-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Explore
        </Link>

        {demoSubmitted ? (
          <section
            className="rounded-2xl border border-emerald-200 bg-white p-6 shadow-sm md:p-9"
            aria-live="polite"
          >
            <div className="mx-auto flex max-w-xl flex-col items-center text-center">
              <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50">
                <CheckCircle2 className="h-9 w-9 text-emerald-600" />
              </div>


              <h1 className="mt-4 text-2xl font-extrabold text-brand-950">
                Your report form is complete!
              </h1>

              <p className="mt-3 text-sm leading-7 text-text-secondary">
                Your information is submitted. This is a
                demonstration only: nothing has been saved or sent to
                FloodGuard's backend.
              </p>

              <div className="mt-7 w-full rounded-xl bg-canvas p-5 text-left">
                <h2 className="mb-4 text-sm font-bold text-brand-950">
                  Report summary
                </h2>

                <div className="space-y-3 text-sm">
                  <div>
                    <span className="text-text-secondary">Community</span>
                    <p className="font-semibold text-brand-950">
                      {selectedCommunity?.name}
                    </p>
                  </div>

                  <div>
                    <span className="text-text-secondary">Hazard category</span>
                    <p className="font-semibold text-brand-950">
                      {selectedCategory?.label}
                    </p>
                  </div>

                  <div>
                    <span className="text-text-secondary">Description</span>
                    <p className="whitespace-pre-wrap text-brand-950">
                      {description}
                    </p>
                  </div>

                  {locationDetails.trim() && (
                    <div>
                      <span className="text-text-secondary">
                        Location details
                      </span>
                      <p className="text-brand-950">{locationDetails}</p>
                    </div>
                  )}

                  {coordinates && (
                    <div>
                      <span className="text-text-secondary">GPS coordinates</span>
                      <p className="text-brand-950">
                        {coordinates.latitude.toFixed(6)},{' '}
                        {coordinates.longitude.toFixed(6)}
                      </p>
                    </div>
                  )}

                  {photo && (
                    <div>
                      <span className="text-text-secondary">Photo attached</span>
                      <p className="font-semibold text-brand-950">
                        {photo.name}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-6 flex w-full flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={resetForm}
                  className="flex-1 rounded-xl bg-brand-950 px-5 py-3 text-sm font-bold text-white transition hover:bg-brand-800"
                >
                  Create another report
                </button>

                <Link
                  to="/"
                  className="flex-1 rounded-xl border border-border-soft px-5 py-3 text-center text-sm font-bold text-brand-950 transition hover:bg-canvas"
                >
                  Back to Explore
                </Link>
              </div>
            </div>
          </section>
        ) : (
          <>
            <div className="mb-8">

              <h1 className="text-3xl font-extrabold tracking-tight text-brand-950 md:text-4xl">
                Report a hazard
              </h1>

              <p className="mt-3 max-w-2xl text-sm leading-7 text-text-secondary md:text-base">
                Help your community stay informed. Share details about
                flooding, rising water levels or drainage problems in your
                area.
              </p>
            </div>

           

            <form onSubmit={handleSubmit} className="space-y-6">
              <section className="rounded-2xl border border-border-soft bg-white p-5 shadow-sm md:p-7">
                <div className="mb-6 flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                    <MapPin className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-brand-950">
                      Where is the hazard?
                    </h2>
                    <p className="mt-1 text-sm text-text-secondary">
                      Identify the community and provide the location.
                    </p>
                  </div>
                </div>

                <div className="space-y-5">
                  <div>
                    <label
                      htmlFor="community"
                      className="mb-2 block text-sm font-semibold text-brand-950"
                    >
                      Community <span className="text-red-600">*</span>
                    </label>

                    <div className="relative">
                      <select
                        id="community"
                        value={communityId}
                        onChange={(event) => setCommunityId(event.target.value)}
                        required
                        disabled={communitiesLoading || communities.length === 0}
                        className={`${inputClass} appearance-none pr-10`}
                      >
                        <option value="">
                          {communitiesLoading
                            ? 'Loading communities...'
                            : 'Select your community'}
                        </option>

                        {communities.map((community) => (
                          <option key={community.id} value={community.id}>
                            {community.name} — {community.lga}, {community.state}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
                    </div>

                    {communityError && (
                      <p className="mt-2 text-xs text-red-600">
                        {communityError}
                      </p>
                    )}

                    {!communitiesLoading &&
                      !communityError &&
                      communities.length === 0 && (
                        <p className="mt-2 text-xs text-amber-700">
                          No active communities are currently available.
                        </p>
                      )}
                  </div>

                  <div>
                    <label
                      htmlFor="location-details"
                      className="mb-2 block text-sm font-semibold text-brand-950"
                    >
                      Specific location or landmark
                    </label>
                    <input
                      id="location-details"
                      type="text"
                      value={locationDetails}
                      onChange={(event) =>
                        setLocationDetails(event.target.value)
                      }
                      maxLength={200}
                      placeholder="e.g. Near the central market, beside the main bridge"
                      className={inputClass}
                    />
                    <p className="mt-1.5 text-xs text-text-secondary">
                      Help responders identify the exact area. This field is
                      optional.
                    </p>
                  </div>

                  <div className="rounded-xl border border-dashed border-border-soft bg-canvas p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-brand-950">
                          Add your current GPS location
                        </p>
                        <p className="mt-1 text-xs text-text-secondary">
                          Your browser will ask for permission. This is optional.
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={getCurrentLocation}
                        disabled={locationLoading}
                        className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-brand-200 bg-white px-4 py-2.5 text-xs font-bold text-brand-800 transition hover:bg-brand-50 disabled:cursor-wait disabled:opacity-60"
                      >
                        <Crosshair className="h-4 w-4" />
                        {locationLoading ? 'Getting location...' : 'Use my location'}
                      </button>
                    </div>

                    {coordinates && (
                      <p className="mt-3 text-xs font-medium text-emerald-700">
                        Location captured: {coordinates.latitude.toFixed(5)},{' '}
                        {coordinates.longitude.toFixed(5)}
                      </p>
                    )}

                    {locationError && (
                      <p className="mt-3 text-xs text-red-600">
                        {locationError}
                      </p>
                    )}
                  </div>
                </div>
              </section>

              <section className="rounded-2xl border border-border-soft bg-white p-5 shadow-sm md:p-7">
                <div className="mb-6 flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-700">
                    <Droplets className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-brand-950">
                      What happened?
                    </h2>
                    <p className="mt-1 text-sm text-text-secondary">
                      Choose the hazard type and describe what you observed.
                    </p>
                  </div>
                </div>

                <fieldset>
                  <legend className="mb-3 text-sm font-semibold text-brand-950">
                    Hazard category <span className="text-red-600">*</span>
                  </legend>

                  <div className="grid gap-3 sm:grid-cols-2">
                    {HAZARD_CATEGORIES.map((item) => {
                      const selected = category === item.value;

                      return (
                        <label
                          key={item.value}
                          className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition ${
                            selected
                              ? 'border-brand-600 bg-brand-50 ring-2 ring-brand-600/10'
                              : 'border-border-soft bg-white hover:border-brand-300 hover:bg-canvas'
                          }`}
                        >
                          <input
                            type="radio"
                            name="hazard-category"
                            value={item.value}
                            checked={selected}
                            onChange={() => setCategory(item.value)}
                            className="mt-1 h-4 w-4 accent-brand-700"
                            required
                          />

                          <span>
                            <span className="block text-sm font-bold text-brand-950">
                              {item.label}
                            </span>
                            <span className="mt-1 block text-xs leading-5 text-text-secondary">
                              {item.description}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>

                <div className="mt-6">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <label
                      htmlFor="description"
                      className="text-sm font-semibold text-brand-950"
                    >
                      Describe the hazard{' '}
                      <span className="text-red-600">*</span>
                    </label>
                    <span
                      className={`text-xs tabular-nums ${
                        description.length > DESCRIPTION_MAX
                          ? 'text-red-600'
                          : 'text-text-secondary'
                      }`}
                    >
                      {description.length}/{DESCRIPTION_MAX}
                    </span>
                  </div>

                  <textarea
                    id="description"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    minLength={DESCRIPTION_MIN}
                    maxLength={DESCRIPTION_MAX}
                    required
                    rows={5}
                    placeholder="Tell us what you observed, when it happened, how severe it appears, and whether people or vehicles are affected..."
                    className={`${inputClass} resize-y leading-6`}
                  />

                  <p className="mt-1.5 text-xs text-text-secondary">
                    Provide at least {DESCRIPTION_MIN} characters. Avoid
                    including private personal information.
                  </p>
                </div>
              </section>

              <section className="rounded-2xl border border-border-soft bg-white p-5 shadow-sm md:p-7">
                <div className="mb-6 flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-700">
                    <Camera className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-brand-950">
                      Add photo evidence
                    </h2>
                    <p className="mt-1 text-sm text-text-secondary">
                      A photo can help people understand the situation. This
                      step is optional.
                    </p>
                  </div>
                </div>

                {photoPreview ? (
                  <div className="overflow-hidden rounded-xl border border-border-soft">
                    <img
                      src={photoPreview}
                      alt="Selected hazard evidence preview"
                      className="max-h-72 w-full bg-canvas object-contain"
                    />

                    <div className="flex flex-wrap items-center justify-between gap-3 p-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-brand-950">
                          {photo?.name}
                        </p>
                        <p className="text-xs text-text-secondary">
                          {photo
                            ? `${(photo.size / (1024 * 1024)).toFixed(2)} MB`
                            : ''}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={removePhoto}
                        className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold text-red-600 transition hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                        Remove photo
                      </button>
                    </div>
                  </div>
                ) : (
                  <label
                    htmlFor="hazard-photo"
                    className="flex cursor-pointer flex-col items-center rounded-xl border-2 border-dashed border-border-soft bg-canvas px-5 py-9 text-center transition hover:border-brand-400 hover:bg-brand-50/40"
                  >
                    <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-white text-brand-700 shadow-sm">
                      <Upload className="h-5 w-5" />
                    </div>
                    <span className="text-sm font-bold text-brand-950">
                      Choose a photo to upload
                    </span>
                    <span className="mt-1 text-xs text-text-secondary">
                      JPG, PNG or other image formats · Maximum 5 MB
                    </span>
                    <input
                      id="hazard-photo"
                      type="file"
                      accept="image/*"
                      onChange={handlePhotoChange}
                      className="sr-only"
                    />
                  </label>
                )}

                {photoError && (
                  <p className="mt-3 text-xs text-red-600">{photoError}</p>
                )}
              </section>

              {submitError && (
                <div
                  role="alert"
                  className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
                >
                  <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                  {submitError}
                </div>
              )}

              <div className="rounded-xl border border-border-soft bg-white p-5">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand-700" />
                  <div>
                    <h3 className="text-sm font-bold text-brand-950">
                      Before you submit
                    </h3>
                    <p className="mt-1 text-xs leading-6 text-text-secondary">
                      Share accurate information based on what you observed.
                      Do not put yourself in danger to take photos or collect
                      information.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded-xl border border-border-soft bg-white px-6 py-3 text-sm font-bold text-text-secondary transition hover:bg-canvas"
                >
                  Clear form
                </button>

                <button
                  type="submit"
                  disabled={communitiesLoading || communities.length === 0}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-950 px-7 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Preview demo submission
                  <CheckCircle2 className="h-4 w-4" />
                </button>
              </div>
            </form>
          </>
        )}
      </main>
    </ResidentShell>
  );
}
