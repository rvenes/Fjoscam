import { FormEvent, MouseEvent, WheelEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowDown, ArrowDownLeft, ArrowDownRight, ArrowLeft, ArrowRight, ArrowUp, ArrowUpLeft, ArrowUpRight, Camera, Crosshair, Eye, Focus, Loader2, Pause, Play, Plus, Radio, RotateCcw, Trash2, Volume2, VolumeX, WifiOff, ZoomIn, ZoomOut } from 'lucide-react';
import type { AppState, CameraConfig, CameraDiscoveryResult, CameraInput, CameraProfile, ConnectionStatus, IrLightMode, IrLightsInfo, Preset, PtzCommand, PtzDirection, StreamInfo, UpdateStatus, WhiteLedState, ZoomFocusState, ZoomRange } from '../shared/types';
import { clickToPtzCommand, presetForKey, presetIdFromKey, zoomNudgeStep } from '../shared/ptz';
import './styles.css';
import { CameraTlsSettings } from './CameraTlsSettings';
import { certificateProblem, errorMessage } from './cameraFeedback';
import { useCameraWork } from './useCameraWork';
import { usePlaybackHealth } from './usePlaybackHealth';
import { coalescedWriter } from './coalescedWriter';
import { useWindowFullscreen } from './useWindowFullscreen';
import { Modal } from './Modal';
import { CameraDiscovery, discoveryDisplayName } from './CameraDiscovery';
import { panasonicPresets } from '../shared/cameraDefaults';
import { allowsPtz, cameraControls, supportsSecondaryLens } from '../shared/cameraControls';

const defaultInput: CameraInput = {
  kind: 'reolink',
  name: '',
  host: '',
  protocol: 'http',
  httpPort: 80,
  rtspPort: 554,
  username: 'admin',
  password: '',
  channel: 0,
  streamChannel: 0,
  lowLatency: false,
  mjpegPath: '/nphMotionJpeg?Resolution=640x480&Quality=Standard',
  ptzPath: '/nphControlCamera',
  streamUrl: '',
  allowInsecureOnvif: false,
  onvifPort: 8000,
};

const directions: Array<{ direction: PtzDirection; Icon: typeof ArrowUp; className: string }> = [
  { direction: 'LeftUp', Icon: ArrowUpLeft, className: 'dir-left-up' },
  { direction: 'Up', Icon: ArrowUp, className: 'dir-up' },
  { direction: 'RightUp', Icon: ArrowUpRight, className: 'dir-right-up' },
  { direction: 'Left', Icon: ArrowLeft, className: 'dir-left' },
  { direction: 'Right', Icon: ArrowRight, className: 'dir-right' },
  { direction: 'LeftDown', Icon: ArrowDownLeft, className: 'dir-left-down' },
  { direction: 'Down', Icon: ArrowDown, className: 'dir-down' },
  { direction: 'RightDown', Icon: ArrowDownRight, className: 'dir-right-down' },
];

// Fallback until the camera has reported its own range via GetZoomFocus.
const defaultZoomRange: ZoomRange = { min: 0, max: 34 };

const clickZones = [
  ['↖', '↖', '↑', '↗', '↗'],
  ['↖', '↖', '↑', '↗', '↗'],
  ['←', '←', '•', '→', '→'],
  ['↙', '↙', '↓', '↘', '↘'],
  ['↙', '↙', '↓', '↘', '↘'],
];

export default function App() {
  const [state, setState] = useState<AppState>({ cameras: [], activeCameraId: null });
  const [form, setForm] = useState<CameraInput>(defaultInput);
  const [editingId, setEditingId] = useState<string | undefined>();
  const [showSettings, setShowSettings] = useState(false);
  const [showTips, setShowTips] = useState(false);
  const [cameraEditMode, setCameraEditMode] = useState(false);
  const [ptzExpanded, setPtzExpanded] = useState(false);
  const [controlsExpanded, setControlsExpanded] = useState(false);
  const viewerFullscreen = useWindowFullscreen();
  const [appVersion, setAppVersion] = useState('');
  const [showAbout, setShowAbout] = useState(false);
  const [diagnosticStatus, setDiagnosticStatus] = useState('');
  const [exportingDiagnostics, setExportingDiagnostics] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const updateRevision = useRef(0);
  const [showUpdateDialog, setShowUpdateDialog] = useState(false);
  const [showPresetDialog, setShowPresetDialog] = useState(false);
  const [presetDraftId, setPresetDraftId] = useState(1);
  const [presetDraftName, setPresetDraftName] = useState('Preset 1');
  const [speed, setSpeed] = useState(30);
  const [focusSpeed, setFocusSpeed] = useState(20);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [streamInfo, setStreamInfo] = useState<{ high?: StreamInfo; low?: StreamInfo }>({});
  const [loadedProfile, setProfile] = useState<CameraProfile | undefined>();
  const profileOwner = useRef<ReturnType<typeof useCameraWork> | null>(null);
  const [irLights, setIrLights] = useState<IrLightsInfo | undefined>();
  const [whiteLed, setWhiteLed] = useState<WhiteLedState | undefined>();
  const [snapshotUrl, setSnapshotUrl] = useState('');
  const [fallbackUrl, setFallbackUrl] = useState('');
  const [isStreamEnabled, setIsStreamEnabled] = useState(true);
  const [systemSuspended, setSystemSuspended] = useState(false);
  const [streamFailure, setStreamFailure] = useState(false);
  const [streamRevision, setStreamRevision] = useState(0);
  const [cameraConfigRevision, setCameraConfigRevision] = useState(0);
  const [digitalZoom, setDigitalZoom] = useState(1);
  const [opticalZoomPosition, setOpticalZoomPosition] = useState(0);
  const [zoomRange, setZoomRange] = useState<ZoomRange>(defaultZoomRange);
  const [audioMuted, setAudioMuted] = useState(true);
  const [audioVolume, setAudioVolume] = useState(60);
  const [digitalPan, setDigitalPan] = useState({ x: 0, y: 0 });
  const [digitalOrigin, setDigitalOrigin] = useState({ x: 50, y: 50 });
  const stageRef = useRef<HTMLDivElement | null>(null);
  const mediaRef = useRef<HTMLImageElement | HTMLVideoElement | null>(null);
  const webRtcFrameRef = useRef<HTMLIFrameElement | null>(null);
  const focusValueRef = useRef(focusSpeed);
  const dragRef = useRef<{
    active: boolean;
    moved: boolean;
    startX: number;
    startY: number;
    panX: number;
    panY: number;
  } | null>(null);
  const runtimeLoadRef = useRef(0);
  const streamOwnerRef = useRef<string | null>(null);
  const zoomTargetRef = useRef<number | null>(null);
  const zoomSendTimerRef = useRef<number | null>(null);
  const zoomBusyRef = useRef(false);
  const zoomPermissionRevision = useRef(0);
  const zoomRefreshTimers = useRef(new Set<number>());
  const stateQueue = useRef<Promise<unknown>>(Promise.resolve());
  const stateRequest = useRef(0);
  const stateRef = useRef(state);
  const mounted = useRef(true);
  const viewChanging = useRef(false);
  const stateViewDirty = useRef(false);
  const teleZoomPending = useRef<string | null>(null);
  const busyRequest = useRef(0);
  const zoomInteractionRef = useRef(0);
  const zoomHoldRef = useRef(false);
  const ptzCameraIdRef = useRef<string | null>(null);
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [configurationError, setConfigurationError] = useState('');
  const [tlsProblem, setTlsProblem] = useState<{ owner: ReturnType<typeof useCameraWork>; protocol: 'HTTPS' | 'RTSPS' }>();
  const [highlightCertificate, setHighlightCertificate] = useState(false);

  const activeCamera = useMemo(
    () => state.cameras.find((camera) => camera.id === state.activeCameraId) ?? null,
    [state],
  );
  const existingCameraHosts = useMemo(() => new Set(state.cameras.map((camera) => camera.host).filter(Boolean)), [state.cameras]);
  const isReolinkCamera = !activeCamera?.kind || activeCamera.kind === 'reolink';
  const cameraWork = useCameraWork(JSON.stringify([activeCamera, cameraConfigRevision]));
  const profile = profileOwner.current === cameraWork ? loadedProfile : undefined;
  const hasSecondaryLens = activeCamera ? supportsSecondaryLens(activeCamera, profile) : false;
  const controls = cameraControls(activeCamera, profile);
  const canZoom = isReolinkCamera && controls.zoom;
  const lightWriter = useMemo(() => coalescedWriter<{ mode?: number; enabled?: boolean; brightness?: number }>(
    (patch) => window.fjoscam.setWhiteLed(activeCamera!.id, patch)), [cameraWork, controls.light]);
  const irWriter = useMemo(() => coalescedWriter<{ mode: IrLightMode }>(
    (patch) => window.fjoscam.setIrLights(activeCamera!.id, patch.mode)), [cameraWork, controls.ir]);
  useLayoutEffect(() => () => lightWriter.cancel(), [lightWriter]);
  useLayoutEffect(() => () => irWriter.cancel(), [irWriter]);
  const playback = usePlaybackHealth(streamSrc(), isStreamEnabled && !systemSuspended, () => {
    setStreamFailure(false);
    setStreamRevision((value) => value + 1);
  });
  const playbackText = systemSuspended ? 'Computer sleeping · playback paused' : streamFailure ? 'Playback failed. Reconnect to retry.' : playback.text;
  const modalOpen = showSettings || showAbout || showPresetDialog || (showUpdateDialog && !!updateStatus);
  useLayoutEffect(() => {
    if (modalOpen) { cancelZoomWork(); void stopHeldPtz(); }
  }, [modalOpen]);

  function reportCameraError(error: unknown) {
    const protocol = certificateProblem(error);
    if (protocol) setTlsProblem({ owner: cameraWork, protocol });
    setMessage(errorMessage(error));
  }

  function clearCameraWork() {
    setTlsProblem(undefined);
    lightWriter.cancel(); irWriter.cancel();
    cameraWork.invalidate();
    clearCurrentStream();
    cancelZoomWork();
    setProfile(undefined); setIrLights(undefined); setWhiteLed(undefined);
    setPresets([]); setStreamInfo({}); setStatus(null); setMessage(''); setStreamFailure(false);
    setOpticalZoomPosition(0); setZoomRange(defaultZoomRange);
    setShowPresetDialog(false); setBusy(false);
    busyRequest.current += 1;
  }

  function cancelZoomWork() {
    zoomPermissionRevision.current += 1;
    if (zoomSendTimerRef.current !== null) window.clearTimeout(zoomSendTimerRef.current);
    zoomSendTimerRef.current = null;
    for (const timer of zoomRefreshTimers.current) window.clearTimeout(timer);
    zoomRefreshTimers.current.clear();
    zoomTargetRef.current = null;
    zoomBusyRef.current = false;
  }

  function captureZoomWork() {
    const current = cameraWork.capture();
    const revision = zoomPermissionRevision.current;
    return () => current() && revision === zoomPermissionRevision.current;
  }

  useLayoutEffect(() => { if (!canZoom) cancelZoomWork(); }, [cameraWork, canZoom]);

  useLayoutEffect(() => {
    clearCameraWork();
    viewChanging.current = false;
    resetDigitalZoom();
    return () => {
      if (zoomSendTimerRef.current !== null) window.clearTimeout(zoomSendTimerRef.current);
      for (const timer of zoomRefreshTimers.current) window.clearTimeout(timer);
      zoomRefreshTimers.current.clear();
    };
  }, [cameraWork]);

  function beginBusy() {
    const request = ++busyRequest.current;
    setBusy(true);
    return () => { if (mounted.current && request === busyRequest.current) setBusy(false); };
  }

  // Serialize whole-state IPC responses. Only the latest intent publishes its
  // snapshot; that snapshot includes all earlier successful queued mutations.
  async function changeState(operation: (current: AppState) => Promise<AppState>, affectsView = true) {
    const request = ++stateRequest.current;
    setConfigurationError('');
    if (affectsView) {
      stateViewDirty.current = true;
      viewChanging.current = true;
      teleZoomPending.current = null;
      clearCameraWork();
      void stopHeldPtz();
    }
    const pending = stateQueue.current.then(async () => {
      if (!mounted.current) return undefined;
      const next = await operation(stateRef.current);
      stateRef.current = next;
      return next;
    });
    stateQueue.current = pending.catch(() => undefined);
    try {
      const next = await pending;
      if (!mounted.current || request !== stateRequest.current || !next) return undefined;
      setState(next);
      if (stateViewDirty.current) setCameraConfigRevision((value) => value + 1);
      stateViewDirty.current = false;
      return next;
    } catch (error) {
      if (mounted.current && request === stateRequest.current) {
        teleZoomPending.current = null;
        setState(stateRef.current);
        setConfigurationError(errorMessage(error));
        setCameraConfigRevision((value) => value + 1);
        stateViewDirty.current = false;
      }
      return undefined;
    }
  }

  useEffect(() => {
    const stop = () => { void stopHeldPtz(); };
    const visibility = () => { if (document.hidden) stop(); };
    window.addEventListener('blur', stop);
    window.addEventListener('mouseup', stop);
    window.addEventListener('pointercancel', stop);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      stop();
      window.removeEventListener('blur', stop);
      window.removeEventListener('mouseup', stop);
      window.removeEventListener('pointercancel', stop);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [cameraWork]);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    void window.fjoscam.getVersion().then(setAppVersion);
    const removeOpenPanelListener = window.fjoscam.onOpenPanel((panel) => {
      if (panel === 'settings') {
        setShowSettings(true);
        setShowTips(false);
        return;
      }
      setShowTips((value) => !value);
    });
    const removeCameraEditListener = window.fjoscam.onCameraEditMode((enabled) => setCameraEditMode(enabled));
    const removeUpdateListener = window.fjoscam.onUpdateStatus((nextStatus) => {
      updateRevision.current += 1;
      setUpdateStatus(nextStatus);
      setShowUpdateDialog(true);
    });
    const removeAboutListener = window.fjoscam.onOpenAbout((version) => {
      setAppVersion(version);
      setShowAbout(true);
    });
    return () => {
      mounted.current = false;
      releaseCurrentStream();
      removeOpenPanelListener();
      removeCameraEditListener();
      removeUpdateListener();
      removeAboutListener();
    };
  }, []);

  useLayoutEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (modalOpen) return;
      if (isEditableTarget(event.target)) return;

      if (event.code === 'F11' || event.code === 'Enter' || event.code === 'NumpadEnter') {
        event.preventDefault();
        if (!event.repeat) void setFullscreenMode(!viewerFullscreen);
        return;
      }

      if (event.code === 'Escape' && viewerFullscreen) {
        event.preventDefault();
        if (!event.repeat) void setFullscreenMode(false);
        return;
      }

      if (event.code === 'PageDown' || event.code === 'PageUp') {
        event.preventDefault();
        if (!event.repeat) void selectAdjacentCamera(event.code === 'PageUp' ? 1 : -1);
        return;
      }

      if (!activeCamera) return;

      if (presetIdFromKey(event.code) !== null) {
        event.preventDefault();
        const preset = presetForKey(event.code, presets);
        if (!event.repeat && preset) void send({ kind: 'preset', presetId: preset.id });
        return;
      }

      const direction = numpadDirection(event.code);

      if (direction) {
        event.preventDefault();
        if (!event.repeat) void send({ kind: 'move', direction, speed });
        return;
      }

      if (event.code === 'Numpad5') {
        event.preventDefault();
        void send({ kind: 'stop' });
        return;
      }

      if (event.code === 'NumpadAdd' || event.key === '+') {
        event.preventDefault();
        if (!event.repeat) setSpeed((value) => clamp(value + 5, 1, 64));
        return;
      }

      if (event.code === 'NumpadSubtract' || event.key === '-') {
        event.preventDefault();
        if (!event.repeat) setSpeed((value) => clamp(value - 5, 1, 64));
        return;
      }

      if (event.code === 'NumpadDivide') {
        event.preventDefault();
        if (!event.repeat && isReolinkCamera) nudgeOpticalZoom(-1);
        return;
      }

      if (event.code === 'NumpadMultiply') {
        event.preventDefault();
        if (!event.repeat && isReolinkCamera) nudgeOpticalZoom(1);
        return;
      }

      if (event.code === 'NumpadDecimal') {
        event.preventDefault();
        if (!event.repeat && activeCamera.kind !== 'panasonic') setAudioMuted((value) => !value);
        return;
      }

    }

    function handleKeyUp(event: KeyboardEvent) {
      if (numpadDirection(event.code)) {
        event.preventDefault();
        void stopHeldPtz();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [activeCamera, cameraWork, profile, isReolinkCamera, modalOpen, opticalZoomPosition, presets, speed, state.cameras, viewerFullscreen, zoomRange]);

  useEffect(() => {
    if (activeCamera) void loadCameraProfile(activeCamera.id);
  }, [cameraWork]);

  useEffect(() => {
    if (activeCamera && canZoom && !viewChanging.current && activeCamera.streamChannel === 1 && teleZoomPending.current === activeCamera.id) {
      teleZoomPending.current = null;
      zoomToMax();
    }
  }, [cameraWork, canZoom]);

  useEffect(() => {
    if (!activeCamera || !isReolinkCamera) return;
    if (!controls.presets) { setPresets([]); return; }
    let cancelled = false;
    const current = cameraWork.capture('presets');
    void window.fjoscam.getPresets(activeCamera.id).then((value) => {
      if (!cancelled && current()) setPresets(value);
    }).catch((error) => { if (!cancelled && current()) reportCameraError(error); });
    return () => { cancelled = true; };
  }, [cameraWork, controls.presets, isReolinkCamera]);

  useEffect(() => { void stopHeldPtz(); }, [controls.move, controls.zoom, controls.focus]);

  useEffect(() => window.fjoscam.onPowerState((powerState) => {
    if (powerState === 'suspend') {
      setSystemSuspended(true);
      teleZoomPending.current = null;
      cancelZoomWork();
      void stopHeldPtz();
      clearCurrentStream();
    } else {
      setSystemSuspended(false);
      if (isStreamEnabled) setCameraConfigRevision((value) => value + 1);
    }
  }), [cameraWork, isStreamEnabled]);

  useEffect(() => {
    if (!activeCamera || viewChanging.current) return;
    if (!isStreamEnabled || systemSuspended) {
      clearCurrentStream();
      setMessage('Disconnected');
      setStatus(null);
      return;
    }
    void loadWebRtcRuntime(activeCamera.id);
    return () => { runtimeLoadRef.current += 1; };
  }, [cameraWork, isStreamEnabled, systemSuspended]);

  useEffect(() => {
    applyWebRtcAudioSettings();
  }, [audioMuted, audioVolume, snapshotUrl]);

  // Keeps the optical zoom position and range in sync with the camera. TrackMix
  // cameras change zoom on their own (auto tracking), so light polling is needed
  // for the slider and keyboard nudges to work from the camera's real position.
  useEffect(() => {
    zoomInteractionRef.current = 0;
    if (!activeCamera || !canZoom) {
      setOpticalZoomPosition(0);
      setZoomRange(defaultZoomRange);
      return;
    }
    if (!isStreamEnabled) return;
    let cancelled = false;
    let pending = false;
    let failures = 0;
    let visibilityRevision = 0;
    let timer: number | undefined;
    const cameraId = activeCamera.id;
    const schedule = () => {
      if (!cancelled && !document.hidden) timer = window.setTimeout(refresh, Math.min(30000, 3000 * 2 ** failures));
    };
    const refresh = async () => {
      if (cancelled || document.hidden || pending) return;
      if (viewChanging.current || zoomBusyRef.current || zoomTargetRef.current !== null || Date.now() - zoomInteractionRef.current < 1500) {
        schedule(); return;
      }
      pending = true;
      const visibleAtStart = visibilityRevision;
      const current = cameraWork.capture('zoom-read');
      try {
        const value = await window.fjoscam.getZoomFocus(cameraId);
        if (cancelled || document.hidden || visibleAtStart !== visibilityRevision || !current()) return;
        if (!Number.isFinite(value.zoom)) { failures = Math.min(failures + 1, 4); return; }
        failures = 0;
        if (!zoomBusyRef.current && zoomTargetRef.current === null) applyZoomState(value);
      } catch { if (visibleAtStart === visibilityRevision) failures = Math.min(failures + 1, 4); }
      finally { pending = false; schedule(); }
    };
    const visibility = () => {
      visibilityRevision++;
      window.clearTimeout(timer);
      failures = 0;
      if (!document.hidden) void refresh();
    };
    void refresh();
    document.addEventListener('visibilitychange', visibility);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [cameraWork, canZoom, isStreamEnabled]);

  async function loadCameraProfile(id: string) {
    const camera = state.cameras.find((item) => item.id === id);
    if (camera?.kind && camera.kind !== 'reolink') {
      setProfile(undefined);
      setIrLights(undefined);
      setWhiteLed(undefined);
      return;
    }
    const current = cameraWork.capture('profile');
    const currentIr = cameraWork.capture('ir');
    const currentLed = cameraWork.capture('white-led-read');
    try {
      const nextProfile = await window.fjoscam.getProfile(id);
      if (!current()) return;
      profileOwner.current = cameraWork;
      setProfile(nextProfile);
      await Promise.all([
        nextProfile?.capabilities.irLights ? window.fjoscam.getIrLights(id).then((value) => {
          if (currentIr() && !irWriter.busy()) setIrLights(value);
        }).catch((error) => { if (currentIr()) reportCameraError(error); }) : undefined,
        nextProfile?.capabilities.whiteLed ? window.fjoscam.getWhiteLed(id).then((value) => {
          if (currentLed() && !lightWriter.busy()) setWhiteLed(value);
        }).catch((error) => { if (currentLed()) reportCameraError(error); }) : undefined,
      ]);
    } catch (error) { if (current()) reportCameraError(error); }
  }

  async function refresh() {
    await changeState(() => window.fjoscam.getState(), false);
  }

  async function setFullscreenMode(enabled: boolean) {
    try { await window.fjoscam.setFullscreen(enabled); }
    catch { setMessage('Could not change fullscreen mode. Try the View menu.'); }
  }

  async function checkForUpdates() {
    setShowUpdateDialog(true);
    await requestUpdate(() => window.fjoscam.checkForUpdates(), 'Could not check for updates. Try again.');
  }

  async function downloadUpdate() {
    await requestUpdate(() => window.fjoscam.downloadUpdate(), 'Could not download the update. Try again.');
  }

  async function installUpdate() {
    await requestUpdate(() => window.fjoscam.quitAndInstallUpdate(), 'Could not start the update installer. Try again.');
  }

  async function requestUpdate(operation: () => Promise<UpdateStatus | void>, failure: string) {
    const revision = ++updateRevision.current;
    try {
      const next = await operation();
      if (mounted.current && revision === updateRevision.current && next) setUpdateStatus(next);
    } catch {
      if (mounted.current && revision === updateRevision.current) {
        setUpdateStatus({ state: 'error', currentVersion: appVersion, message: failure });
      }
    }
  }

  async function selectAdjacentCamera(direction: -1 | 1) {
    await changeState((current) => {
      if (current.cameras.length === 0) return Promise.resolve(current);
      const index = Math.max(0, current.cameras.findIndex((camera) => camera.id === current.activeCameraId));
      return window.fjoscam.setActiveCamera(current.cameras[(index + direction + current.cameras.length) % current.cameras.length].id);
    });
  }

  async function loadWebRtcRuntime(id: string) {
    const loadId = runtimeLoadRef.current + 1;
    runtimeLoadRef.current = loadId;
    const currentView = cameraWork.capture();
    const current = () => currentView() && runtimeLoadRef.current === loadId;
    setMessage('');
    setStreamFailure(false);
    setStatus(null);
    try {
      setFallbackUrl('');
      setSnapshotUrl('');
      const camera = state.cameras.find((item) => item.id === id);
      if (camera?.kind === 'panasonic') {
        const mjpegUrl = await window.fjoscam.getMjpegUrl(id);
        if (!current()) return;
        setSnapshotUrl(mjpegUrl);
        setPresets(panasonicPresets());
        setStreamInfo({});
        setStreamRevision((value) => value + 1);
        setMessage('');

        return;
      }
      if (camera?.kind === 'generic') {
        streamOwnerRef.current = id;
        const webRtcStream = await window.fjoscam.getWebRtcStream(id);
        if (!current()) return;
        setSnapshotUrl(webRtcStream.pageUrl);
        setPresets([]);
        setStreamInfo({});
        setProfile(undefined);
        setFallbackUrl('');
        setStreamRevision((value) => value + 1);
        setMessage('');

        return;
      }
      // RTSP playback must not wait for the camera's HTTP metadata API.
      const metadataCurrent = cameraWork.capture('stream-info');
      void window.fjoscam.getStreamInfo(id).then((info) => {
        if (current() && metadataCurrent()) setStreamInfo(info);
      }).catch(() => undefined);

      streamOwnerRef.current = id;
      const webRtcStream = await window.fjoscam.getWebRtcStream(id);
      if (!current()) return;
      setSnapshotUrl(webRtcStream.pageUrl);
      setStreamRevision((value) => value + 1);
      setMessage('');


      const nextFallbackUrl = await window.fjoscam.getMjpegUrl(id).catch(() => '');
      if (!current()) return;
      setFallbackUrl(nextFallbackUrl);
    } catch (error) {
      if (current()) { setStreamFailure(true); reportCameraError(error); }
    }
  }

  async function saveCamera(event: FormEvent) {
    event.preventDefault();
    const pending = changeState(() => window.fjoscam.saveCamera(form, editingId));
    const finish = beginBusy();
    try {
      if (!await pending) return;
      setForm(defaultInput);
      setEditingId(undefined);
      setShowSettings(false);
    } finally { finish(); }
  }

  async function selectCamera(id: string) {
    await changeState(() => window.fjoscam.setActiveCamera(id));
  }

  async function setViewChannel(channel: number) {
    if (!activeCamera) return;
    const pending = changeState(() => window.fjoscam.setStreamChannel(activeCamera.id, channel));
    // Apply the tele-lens maximum only in the committed, updated view.
    if (channel === 1 && isReolinkCamera) teleZoomPending.current = activeCamera.id;
    await pending;
  }

  async function setStreamQuality(lowLatency: boolean) {
    if (!activeCamera) return;
    await changeState(() => window.fjoscam.setStreamQuality(activeCamera.id, lowLatency));
  }

  async function testCamera(id = activeCamera?.id) {
    if (!id || viewChanging.current) return;
    const current = cameraWork.capture('presets');
    const metadataCurrent = cameraWork.capture('stream-info');
    const finish = beginBusy();
    setMessage('');
    try {
      const result = await window.fjoscam.testCamera(id);
      if (!current()) return;
      setStatus(result);
      if (!result.ok && certificateProblem(result.message)) reportCameraError(result.message);
      if (result.presets && controls.presets) setPresets(result.presets);
      if (result.streams && metadataCurrent()) setStreamInfo(result.streams);
      if (result.cameraName && activeCamera && activeCamera.name !== result.cameraName) {
        await changeState(async (latest) => {
          const camera = latest.cameras.find((item) => item.id === id);
          // Never restore settings captured before another queued edit.
          if (!current() || !camera) return latest;
          return window.fjoscam.saveCamera({ ...camera, name: result.cameraName!, password: '' }, id);
        }, false);
      }
    } catch (error) {
      if (current()) reportCameraError(error);
    } finally { finish(); }
  }

  async function toggleStream() {
    if (!activeCamera) return;
    if (isStreamEnabled) clearCurrentStream();
    setIsStreamEnabled((enabled) => !enabled);
  }

  async function removeCamera(id: string) {
    const camera = state.cameras.find((item) => item.id === id);
    const name = camera?.name ?? 'this camera';
    const confirmed = window.confirm(`Delete camera "${name}" from Fjoscam?\n\nThis only removes it from Fjoscam. The camera itself is not changed.`);
    if (!confirmed) return;
    await changeState(() => window.fjoscam.removeCamera(id));
  }

  async function moveCamera(id: string, direction: -1 | 1) {
    await changeState((current) => {
      const index = current.cameras.findIndex((camera) => camera.id === id);
      const targetIndex = index + direction;
      if (index < 0 || targetIndex < 0 || targetIndex >= current.cameras.length) return Promise.resolve(current);
      const nextCameras = [...current.cameras];
      [nextCameras[index], nextCameras[targetIndex]] = [nextCameras[targetIndex], nextCameras[index]];
      return window.fjoscam.reorderCameras(nextCameras.map((camera) => camera.id));
    }, false);
  }

  async function changeIrMode(mode: IrLightMode) {
    if (!activeCamera || !controls.ir || viewChanging.current) return;
    const current = cameraWork.capture('ir');
    setMessage('Updating IR lights...');
    setIrLights((value) => (value ? { ...value, mode } : { mode, options: ['auto', 'on', 'off'] }));
    irWriter.push({ mode }, { current, success: () => setMessage('IR lights updated'), error: (error) => reportCameraError(error) });
  }

  // Spotlight behaviour: 0 = off (IR night vision takes over), 1 = auto at
  // night on detection, 3 = the camera's own schedule.
  async function setCameraLightMode(mode: 0 | 1 | 3) {
    if (!activeCamera || !controls.light || viewChanging.current) return;
    const current = cameraWork.capture('white-led-write');
    cameraWork.capture('white-led-read');
    setMessage('Updating spotlight...');
    setWhiteLed((value) => ({ ...value, enabled: mode !== 0, mode }));
    lightWriter.push({ mode }, { current,
      success: () => setMessage(mode === 0 ? 'Spotlight off - IR night vision active' : mode === 1 ? 'Spotlight auto (motion at night)' : 'Spotlight on camera schedule'),
      error: (error) => reportCameraError(error) });
  }

  async function setLegacyCameraLight(enabled: boolean) {
    if (!activeCamera || !controls.light || viewChanging.current) return;
    const current = cameraWork.capture('white-led-write');
    cameraWork.capture('white-led-read');
    const brightness = enabled ? (whiteLed?.brightness && whiteLed.brightness > 0 ? whiteLed.brightness : 85) : 0;
    setMessage('Updating spotlight...');
    setWhiteLed((value) => ({ ...value, enabled, brightness }));
    lightWriter.push({ enabled, brightness }, { current, success: () => setMessage(enabled ? 'Spotlight on' : 'Spotlight off'),
      error: (error) => reportCameraError(error) });
  }

  async function setCameraLightBrightness(brightness: number) {
    if (!activeCamera || !controls.light || viewChanging.current) return;
    const current = cameraWork.capture('white-led-write');
    cameraWork.capture('white-led-read');
    setWhiteLed((value) => ({ ...value, enabled: value?.enabled ?? false, brightness, supportsBrightness: true }));
    setMessage('Updating spotlight...');
    lightWriter.push({ brightness }, { current, success: () => setMessage(`Spotlight brightness ${brightness}%`),
      error: (error) => reportCameraError(error) }, 150);
  }

  async function playSiren() {
    if (!activeCamera || !controls.siren || viewChanging.current) return;
    const current = cameraWork.capture('siren');
    const confirmed = window.confirm(`Play siren on "${activeCamera.name}"?`);
    if (!confirmed) return;
    setMessage('Playing siren...');
    try {
      await window.fjoscam.playSiren(activeCamera.id);
      if (!current()) return;
      setMessage('Siren command sent');
    } catch (error) {
      if (current()) reportCameraError(error);
    }
  }

  async function fetchCameraName() {
    const finish = beginBusy();
    setMessage('');
    try {
      const cameraName = await window.fjoscam.getDeviceName(form);
      if (!cameraName) {
        setMessage('Camera did not return a name.');
        return;
      }
      // A slow name lookup must not restore an old address or certificate exception.
      setForm((current) => current === form ? { ...current, name: cameraName } : current);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      finish();
    }
  }

  function useDiscoveredCamera(camera: CameraDiscoveryResult) {
    const httpPort = camera.ports.https ?? camera.ports.http ?? 80;
    const isPanasonic = /panasonic/i.test([camera.manufacturer, camera.model, camera.name].filter(Boolean).join(' '));
    setForm({
      ...form,
      kind: isPanasonic ? 'panasonic' : 'reolink',
      name: isPanasonic ? 'Panasonic' : discoveryDisplayName(camera),
      host: camera.host,
      password: '',
      streamUrl: '',
      httpsTrust: undefined,
      rtspsTrust: undefined,
      allowInsecureOnvif: false,
      onvifPort: camera.ports.onvif ?? 8000,
      protocol: camera.ports.https ? 'https' : 'http',
      httpPort,
      rtspPort: camera.ports.rtsp ?? 554,
      username: isPanasonic && form.username === 'admin' ? '' : form.username,
      channel: 0,
      streamChannel: 0,
      mjpegPath: '/nphMotionJpeg?Resolution=640x480&Quality=Standard',
      ptzPath: '/nphControlCamera',
    });
    setMessage(`Selected ${camera.host}. Enter username and password, then save.`);
  }

  function setCameraKind(kind: CameraInput['kind']) {
    setForm({
      ...form,
      kind,
      httpsTrust: kind === 'generic' ? undefined : form.httpsTrust,
      rtspsTrust: undefined,
      allowInsecureOnvif: false,
      ...(kind === 'panasonic'
        ? {
            name: form.name || 'Panasonic',
            username: form.username === 'admin' ? '' : form.username,
            httpPort: form.httpPort || 80,
            rtspPort: form.rtspPort || 554,
            mjpegPath: form.mjpegPath || '/nphMotionJpeg?Resolution=640x480&Quality=Standard',
            ptzPath: form.ptzPath || '/nphControlCamera',
          }
        : kind === 'generic'
          ? {
              name: form.name || 'UniFi / generic stream',
              host: inferHostFromStreamUrl(form.streamUrl || form.host),
              username: form.username || '',
              password: form.password || '',
              httpPort: form.httpPort || 80,
              rtspPort: form.rtspPort || 554,
              streamUrl: form.streamUrl || '',
            }
        : {}),
    });
  }

  function editCamera(camera: CameraConfig, reviewCertificate = false) {
    setHighlightCertificate(reviewCertificate);
    setForm({
      ...camera,
      kind: camera.kind ?? 'reolink',
      streamChannel: camera.streamChannel ?? camera.channel,
      password: '',
      streamUrl: '',
    });
    setEditingId(camera.id);
    setShowSettings(true);
  }

  function closeSettings() {
    setShowSettings(false);
    setHighlightCertificate(false);
    setForm(defaultInput);
    setEditingId(undefined);
  }

  async function send(command: PtzCommand) {
    if (command.kind === 'stop' && ptzCameraIdRef.current) {
      await stopHeldPtz();
      return;
    }
    if (!activeCamera || viewChanging.current || activeCamera.kind === 'generic') return;
    if (!allowsPtz(command, controls)) return;
    const current = cameraWork.capture();
    const cameraId = activeCamera.id;
    if (['move', 'zoom', 'focus'].includes(command.kind)) ptzCameraIdRef.current = cameraId;
    try {
      await window.fjoscam.sendPtz(cameraId, command);
      if (!current()) return;
      // Preset recall usually moves the optical zoom as well.
      if (command.kind === 'preset' && isReolinkCamera) scheduleZoomRefresh(2500);
    } catch (error) {
      if (current()) reportCameraError(error);
    }
  }

  async function stopHeldPtz() {
    const current = cameraWork.capture();
    const cameraId = ptzCameraIdRef.current;
    ptzCameraIdRef.current = null;
    zoomHoldRef.current = false;
    if (!cameraId) return;
    try { await window.fjoscam.sendPtz(cameraId, { kind: 'stop' }); }
    catch (error) { if (current()) reportCameraError(error); }
  }

  function startZoomHold(direction: 'in' | 'out') {
    zoomHoldRef.current = true;
    void send({ kind: 'zoom', direction, speed });
  }

  function stopZoomHold() {
    if (!zoomHoldRef.current) return;
    zoomHoldRef.current = false;
    void send({ kind: 'stop' });
    scheduleZoomRefresh(600);
  }

  function applyZoomState(state: ZoomFocusState) {
    if (typeof state.zoom === 'number') setOpticalZoomPosition(state.zoom);
    if (state.zoomRange) setZoomRange(state.zoomRange);
  }

  // Queues an absolute optical zoom position. Sends are debounced so slider drags
  // and repeated key presses collapse into one camera command. The raw target is
  // sent unclamped: the main process clamps against the camera's real range, so a
  // stale local range can never zoom the wrong way.
  function queueZoomPosition(position: number) {
    if (!activeCamera || !canZoom || viewChanging.current) return;
    const current = captureZoomWork();
    cameraWork.capture('zoom-read');
    const target = Math.round(position);
    zoomTargetRef.current = target;
    zoomInteractionRef.current = Date.now();
    setOpticalZoomPosition(clamp(target, zoomRange.min, zoomRange.max));
    if (zoomSendTimerRef.current !== null) window.clearTimeout(zoomSendTimerRef.current);
    zoomSendTimerRef.current = window.setTimeout(() => {
      zoomSendTimerRef.current = null;
      if (current()) void flushZoomPosition(activeCamera.id, current);
    }, 200);
  }

  async function flushZoomPosition(cameraId: string, current: () => boolean) {
    if (!current() || zoomBusyRef.current) return;
    const target = zoomTargetRef.current;
    if (target === null) return;
    zoomTargetRef.current = null;
    zoomBusyRef.current = true;
    try {
      const result = await window.fjoscam.setZoomPosition(cameraId, target);
      if (current() && zoomTargetRef.current === null) applyZoomState(result);
    } catch (error) {
      if (current()) reportCameraError(error);
    } finally {
      if (current()) {
        zoomBusyRef.current = false;
        if (zoomTargetRef.current !== null) void flushZoomPosition(cameraId, current);
      }
    }
  }

  function nudgeOpticalZoom(direction: -1 | 1) {
    const base = zoomTargetRef.current ?? opticalZoomPosition;
    queueZoomPosition(base + direction * zoomNudgeStep(zoomRange));
  }

  function zoomToMax() {
    // The main process clamps to the camera's true maximum.
    queueZoomPosition(Number.MAX_SAFE_INTEGER);
  }

  function scheduleZoomRefresh(delayMs: number) {
    if (!activeCamera || !canZoom || viewChanging.current) return;
    const cameraId = activeCamera.id;
    const current = captureZoomWork();
    const timer = window.setTimeout(() => {
      zoomRefreshTimers.current.delete(timer);
      if (!current() || zoomBusyRef.current || zoomTargetRef.current !== null) return;
      const currentRead = cameraWork.capture('zoom-read');
      window.fjoscam.getZoomFocus(cameraId)
        .then((state) => {
          if (!current() || !currentRead() || zoomBusyRef.current || zoomTargetRef.current !== null) return;
          applyZoomState(state);
        })
        .catch(() => undefined);
    }, delayMs);
    zoomRefreshTimers.current.add(timer);
  }

  function changeFocus(value: number) {
    const nextValue = clamp(value, 1, 64);
    const previous = focusValueRef.current;
    focusValueRef.current = nextValue;
    setFocusSpeed(nextValue);

    if (nextValue === previous) return;
    void send({
      kind: 'focus',
      direction: nextValue > previous ? 'far' : 'near',
      speed: Math.max(8, Math.min(64, Math.abs(nextValue - previous) * 4)),
    });
  }

  function stopFocus() {
    void send({ kind: 'stop' });
  }

  async function saveCurrentPreset() {
    if (!activeCamera || !controls.presetWrite || viewChanging.current) return;
    const current = cameraWork.capture('presets');
    const presetId = Number(presetDraftId);
    if (!Number.isFinite(presetId) || presetId < 1 || presetId > 64) {
      setMessage('Preset number must be between 1 and 64.');
      setStatus({ ok: false, message: 'Preset number must be between 1 and 64.' });
      return;
    }

    const name = presetDraftName.trim() || `Preset ${Math.round(presetId)}`;

    const finish = beginBusy();
    setMessage('Saving preset...');
    try {
      const nextPresets = await window.fjoscam.savePreset(activeCamera.id, presetId, name);
      if (!current()) return;
      setPresets(nextPresets);
      setShowPresetDialog(false);
      setStatus({ ok: true, message: `Saved preset ${Math.round(presetId)}` });
      setMessage(`Saved preset ${Math.round(presetId)}`);
    } catch (error) {
      if (!current()) return;
      const message = errorMessage(error);
      setStatus({ ok: false, message });
      setMessage(message);
    } finally {
      finish();
    }
  }

  async function deletePreset(preset: Preset) {
    if (!activeCamera || !controls.presetWrite || viewChanging.current) return;
    const current = cameraWork.capture('presets');
    const confirmed = window.confirm(`Delete "${preset.name}"?`);
    if (!confirmed) return;

    const finish = beginBusy();
    setMessage(`Deleting preset ${preset.id}...`);
    try {
      const nextPresets = await window.fjoscam.deletePreset(activeCamera.id, preset.id);
      if (!current()) return;
      setPresets(nextPresets);
      setStatus({ ok: true, message: `Deleted preset ${preset.id}` });
      setMessage(`Deleted preset ${preset.id}`);
    } catch (error) {
      if (!current()) return;
      const message = errorMessage(error);
      setStatus({ ok: false, message });
      setMessage(message);
    } finally {
      finish();
    }
  }

  function openPresetDialog() {
    const suggestedId = nextPresetId(presets);
    const existingPreset = presets.find((preset) => preset.id === suggestedId);
    setPresetDraftId(suggestedId);
    setPresetDraftName(existingPreset?.name ?? `Preset ${suggestedId}`);
    setShowPresetDialog(true);
  }

  function startVideoPointer(event: MouseEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    if (digitalZoom > 1) {
      startDigitalDrag(event);
      return;
    }

    event.preventDefault();
    void startPtzFromPointer(event);
  }

  async function startPtzFromPointer(event: MouseEvent<HTMLDivElement>) {
    if (!activeCamera || !stageRef.current) return;
    const bounds = getActiveMediaBounds();
    if (
      event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom
    ) {
      return;
    }

    const x = (event.clientX - bounds.left) / bounds.width;
    const y = (event.clientY - bounds.top) / bounds.height;
    const command = clickToPtzCommand(x, y, speed);
    if (!command) return;
    await send(command);
  }

  function stopVideoPointer() {
    if (digitalZoom > 1) {
      stopDigitalDrag();
      return;
    }
    void send({ kind: 'stop' });
  }

  function handleWheel(event: WheelEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    applyDigitalZoom(event);
  }

  function startDigitalDrag(event: MouseEvent<HTMLDivElement>) {
    if (digitalZoom <= 1 || event.button !== 0) return;
    event.preventDefault();
    dragRef.current = {
      active: true,
      moved: false,
      startX: event.clientX,
      startY: event.clientY,
      panX: digitalPan.x,
      panY: digitalPan.y,
    };
  }

  function moveDigitalDrag(event: MouseEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag?.active || digitalZoom <= 1 || !stageRef.current) return;

    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (Math.hypot(dx, dy) > 4) drag.moved = true;
    if (!drag.moved) return;

    const bounds = getActiveMediaBounds();
    setDigitalPan(clampPan({ x: drag.panX + dx, y: drag.panY + dy }, digitalZoom, bounds));
  }

  function stopDigitalDrag() {
    if (!dragRef.current?.active) return;
    dragRef.current.active = false;
  }

  function applyDigitalZoom(event: WheelEvent<HTMLDivElement>) {
    if (!stageRef.current) return;
    const bounds = getActiveMediaBounds();
    if (
      event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom
    ) {
      return;
    }

    const cursor = {
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
    };
    const origin = {
      x: (digitalOrigin.x / 100) * bounds.width,
      y: (digitalOrigin.y / 100) * bounds.height,
    };
    const nextZoom = clamp(digitalZoom + (event.deltaY < 0 ? 0.18 : -0.18), 1, 4);

    if (nextZoom === 1) {
      resetDigitalZoom();
      return;
    }

    const imagePoint = {
      x: (cursor.x - digitalPan.x - (1 - digitalZoom) * origin.x) / digitalZoom,
      y: (cursor.y - digitalPan.y - (1 - digitalZoom) * origin.y) / digitalZoom,
    };
    const nextPan = {
      x: cursor.x - nextZoom * imagePoint.x - (1 - nextZoom) * origin.x,
      y: cursor.y - nextZoom * imagePoint.y - (1 - nextZoom) * origin.y,
    };

    setDigitalZoom(nextZoom);
    setDigitalPan(clampPan(nextPan, nextZoom, bounds));
  }

  function resetDigitalZoom() {
    setDigitalZoom(1);
    setDigitalPan({ x: 0, y: 0 });
    setDigitalOrigin({ x: 50, y: 50 });
  }

  function streamSrc(): string {
    if (!snapshotUrl) return '';
    if (activeCamera?.kind === 'panasonic') {
      return `${snapshotUrl}${snapshotUrl.includes('?') ? '&' : '?'}r=${streamRevision}`;
    }
    const params = new URLSearchParams({
      r: String(streamRevision),
      lens: String(activeCamera?.streamChannel ?? 0),
      q: activeCamera?.lowLatency ? 'low' : 'high',
    });
    return `${snapshotUrl}${snapshotUrl.includes('?') ? '&' : '?'}${params.toString()}`;
  }

  const activeStreamInfo = activeCamera?.lowLatency ? streamInfo.low : streamInfo.high;
  const streamDetail = activeCamera
    ? `${playbackText}${playback.state === 'live' ? formatStreamInfo(activeStreamInfo) : ''}${digitalZoom > 1 ? ` · Digital zoom ${digitalZoom.toFixed(1)}x` : ''}` : '';

  function handleStreamError() {
    if (isStreamEnabled) setStreamFailure(true);
  }

  function reconnectStream() {
    if (!activeCamera) return;
    setStreamFailure(false);
    setIsStreamEnabled(true);
    // A new view generation cancels old observations and re-registers the
    // configured stream. No automatic quality change or competing timer.
    setCameraConfigRevision((value) => value + 1);
  }

  function applyWebRtcAudioSettings() {
    void window.fjoscam.setStreamAudio(audioMuted || audioVolume === 0, clamp(audioVolume / 100, 0, 1))
      .catch(() => { /* Playback remains usable if the frame is navigating. */ });
  }

  function setVolume(value: number) {
    const nextVolume = clamp(value, 0, 100);
    setAudioVolume(nextVolume);
    if (nextVolume > 0 && audioMuted) setAudioMuted(false);
  }

  function clearCurrentStream() {
    runtimeLoadRef.current += 1;
    releaseCurrentStream();
    setStreamFailure(false);
    setSnapshotUrl('');
    setFallbackUrl('');
  }

  function releaseCurrentStream() {
    const current = cameraWork.capture();
    const id = streamOwnerRef.current;
    streamOwnerRef.current = null;
    if (id) void window.fjoscam.releaseStream(id).catch(() => {
      if (mounted.current && current() && !streamOwnerRef.current) setMessage('Could not release the previous video stream. Reconnect to retry.');
    });
  }

  function getActiveMediaBounds(): DOMRect {
    if (!stageRef.current) return new DOMRect();
    return mediaRef.current ? getMediaViewportRect(stageRef.current, mediaRef.current) : stageRef.current.getBoundingClientRect();
  }

  return (
    <main className={`shell ${viewerFullscreen ? 'viewer-fullscreen' : ''}`}>
      <aside className="sidebar">
        <div className="brand">
          <Radio size={26} />
          <span>Fjoscam</span>
        </div>

        <section className="sidebar-zone camera-zone">
          <div className="section-title">
            <span>Kamera</span>
            <button className="icon-button" title="Add camera" onClick={() => setShowSettings(true)}>
              <Plus size={18} />
            </button>
          </div>
          {cameraEditMode && <div className="edit-mode-banner">Camera edit mode</div>}
          {state.configurationNotice === 'recovered-from-backup' && (
            <div className="configuration-notice" role="alert">
              <strong>Camera settings recovered from backup.</strong>
              <span>Recent changes may be missing. Check the camera list and settings.</span>
            </div>
          )}

          <div className="camera-list">
            {state.cameras.map((camera, index) => (
              <div className={`camera-row ${cameraEditMode ? 'editing' : ''}`} key={camera.id}>
                <button
                  className={`camera-item ${camera.id === state.activeCameraId ? 'active' : ''}`}
                  onClick={() => void selectCamera(camera.id)}
                >
                  <span className="camera-name">{camera.name}</span>
                  <span className="camera-host">{camera.host}</span>
                </button>
                {cameraEditMode && (
                  <div className="camera-edit-actions" aria-label={`Edit ${camera.name}`}>
                    <button className="icon-button" title="Move up" disabled={index === 0} onClick={() => void moveCamera(camera.id, -1)}>
                      <ArrowUp size={16} />
                    </button>
                    <button className="icon-button" title="Move down" disabled={index === state.cameras.length - 1} onClick={() => void moveCamera(camera.id, 1)}>
                      <ArrowDown size={16} />
                    </button>
                    <button className="icon-button danger-icon" title="Delete camera" onClick={() => void removeCamera(camera.id)}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                )}
              </div>
            ))}
            {state.cameras.length === 0 && <p className="empty">Legg til eit Reolink-kamera på LAN.</p>}
          </div>
        </section>

        <section className="sidebar-zone controls-zone">
          {activeCamera && activeCamera.kind !== 'generic' && <div className={`ptz-panel collapsible-panel ${ptzExpanded ? 'expanded' : ''}`}>
            <button className="panel-toggle" onClick={() => setPtzExpanded((value) => !value)}>
              <span>PTZ</span>
              <small>{ptzExpanded ? 'Hide' : `Speed ${speed}`}</small>
            </button>

            {ptzExpanded && (
              <div className="panel-body">
                {isReolinkCamera && <p className="control-hint">{capabilitySummary(profile)}</p>}
                <div className="ptz-grid">
                  {directions.map(({ direction, Icon, className }) => (
                    <button
                      key={direction}
                      className={`ptz-button ${className}`}
                      title={direction}
                      disabled={!allowsPtz({ kind: 'move', direction, speed }, controls)}
                      onMouseDown={() => void send({ kind: 'move', direction, speed })}
                      onMouseUp={() => void send({ kind: 'stop' })}
                      onMouseLeave={() => void send({ kind: 'stop' })}
                    >
                      <Icon size={20} />
                    </button>
                  ))}
                  <button className="ptz-button center" title="Stop" disabled={!activeCamera} onClick={() => void send({ kind: 'stop' })}>
                    <Crosshair size={20} />
                  </button>
                </div>

                <label className="slider-label">
                  <span>Speed</span>
                  <strong>{speed}</strong>
                  <input min="1" max="64" value={speed} disabled={!controls.move} type="range" onChange={(event) => setSpeed(Number(event.target.value))} />
                </label>

                {canZoom && (
                  <label className="slider-label zoom-position-control">
                    <span>Optical zoom</span>
                    <strong>{zoomPositionLabel(opticalZoomPosition, zoomRange)}</strong>
                    <input
                      min={zoomRange.min}
                      max={zoomRange.max}
                      step="1"
                      value={clamp(opticalZoomPosition, zoomRange.min, zoomRange.max)}
                      type="range"
                      onChange={(event) => queueZoomPosition(Number(event.target.value))}
                    />
                  </label>
                )}

                <div className="quick-row">
                  <button
                    disabled={!controls.zoom}
                    onMouseDown={() => startZoomHold('out')}
                    onMouseUp={stopZoomHold}
                    onMouseLeave={stopZoomHold}
                    title="Zoom out (hold)"
                  >
                    <ZoomOut size={18} />
                  </button>
                  <button
                    disabled={!controls.zoom}
                    onMouseDown={() => startZoomHold('in')}
                    onMouseUp={stopZoomHold}
                    onMouseLeave={stopZoomHold}
                    title="Zoom in (hold)"
                  >
                    <ZoomIn size={18} />
                  </button>
                  <button disabled={!activeCamera} onClick={() => { void testCamera(); if (isReolinkCamera && activeCamera) void loadCameraProfile(activeCamera.id); }} title="Refresh presets">
                    {busy ? <Loader2 className="spin" size={18} /> : <RotateCcw size={18} />}
                  </button>
                </div>

                <label className="slider-label">
                  <span>Focus</span>
                  <strong>{focusSpeed}</strong>
                  <input
                    min="1"
                    max="64"
                    value={focusSpeed}
                    disabled={!controls.focus}
                    type="range"
                    onChange={(event) => changeFocus(Number(event.target.value))}
                    onMouseUp={stopFocus}
                    onTouchEnd={stopFocus}
                    onKeyUp={stopFocus}
                  />
                </label>
                <div className="quick-row">
                  <button disabled={!controls.focus} onClick={() => void send({ kind: 'focus', direction: 'near', speed: focusSpeed })} title="Focus near">
                    <Focus size={18} />
                  </button>
                  <button disabled={!controls.focus} onClick={() => void send({ kind: 'focus', direction: 'far', speed: focusSpeed })} title="Focus far">
                    <Eye size={18} />
                  </button>
                  <button disabled={!controls.presetWrite || busy} onClick={openPresetDialog} title="Save current PTZ preset">
                    Save preset
                  </button>
                </div>
              </div>
            )}
          </div>}

          {activeCamera && profile && (
            <div className={`device-panel collapsible-panel ${controlsExpanded ? 'expanded' : ''}`}>
              <button className="panel-toggle" onClick={() => setControlsExpanded((value) => !value)}>
                <span>Controls</span>
                <small>{controlsExpanded ? 'Hide' : profile.device?.model ?? 'Reolink'}</small>
              </button>

              {controlsExpanded && (
                <div className="panel-body">

            <div className="device-info">
              {profile.device?.firmware && <span>FW {profile.device.firmware}</span>}
              {profile.channels.length > 0 && <span>{profile.channels.filter((channel) => channel.online).length}/{profile.channels.length} channels online</span>}
            </div>

            {profile.capabilities.irLights && irLights && (
              <label className="control-row">
                <span>IR</span>
                <select value={irLights.mode ?? 'auto'} onChange={(event) => void changeIrMode(event.target.value as IrLightMode)}>
                  {irLights.options.map((option) => (
                    <option key={option} value={option}>
                      {irOptionLabel(option)}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {controls.light && whiteLed && (
              <div className="light-controls">
                {whiteLed.supportsModes ? (
                  <div className="segmented-control" aria-label="Spotlight mode">
                    <button className={whiteLed.mode === 0 ? 'selected' : ''} onClick={() => void setCameraLightMode(0)}>
                      Off
                    </button>
                    <button className={whiteLed.mode === 1 ? 'selected' : ''} onClick={() => void setCameraLightMode(1)}>
                      Auto
                    </button>
                    <button className={whiteLed.mode === 3 ? 'selected' : ''} onClick={() => void setCameraLightMode(3)}>
                      Schedule
                    </button>
                  </div>
                ) : (
                  <div className="segmented-control" aria-label="Spotlight">
                    <button className={whiteLed.enabled ? 'selected' : ''} onClick={() => void setLegacyCameraLight(true)}>
                      Light on
                    </button>
                    <button className={!whiteLed.enabled ? 'selected' : ''} onClick={() => void setLegacyCameraLight(false)}>
                      Off
                    </button>
                  </div>
                )}
                {whiteLed.supportsBrightness && (
                  <label className="slider-label">
                    <span>Light</span>
                    <strong>{whiteLed.brightness ?? 0}%</strong>
                    <input
                      min="0"
                      max="100"
                      value={whiteLed.brightness ?? 0}
                      type="range"
                      onChange={(event) => void setCameraLightBrightness(Number(event.target.value))}
                    />
                  </label>
                )}
                <small className="control-hint">
                  {whiteLed.supportsModes
                    ? "Off keeps the spotlight dark so IR night vision works. Auto turns it on at motion during night. Schedule follows the camera's own timer."
                    : 'Some cameras require an admin user to change the light.'}
                </small>
              </div>
            )}

            {profile.capabilities.siren && (
              <button className="wide-control danger-control" onClick={() => void playSiren()}>
                Play siren
              </button>
            )}
                </div>
              )}
            </div>
          )}
        </section>
      </aside>

      <section className="viewer">
        <header className="topbar">
          <div>
            <h1>{activeCamera?.name ?? 'Live View'}</h1>
            <p>{activeCamera ? cameraSubtitle(activeCamera, hasSecondaryLens) : 'Add a camera to begin'}</p>
          </div>
          <div className="top-actions">
            {activeCamera && isReolinkCamera && hasSecondaryLens && (
              <div className="channel-switch" aria-label="View channel">
                <button className={(activeCamera.streamChannel ?? 0) === 0 ? 'selected' : ''} onClick={() => void setViewChannel(0)}>Wide</button>
                <button className={(activeCamera.streamChannel ?? 0) === 1 ? 'selected' : ''} onClick={() => void setViewChannel(1)}>Zoom</button>
              </div>
            )}
            {activeCamera && isReolinkCamera && (
              <div className="channel-switch quality-switch" aria-label="Stream quality">
                <button className={!activeCamera.lowLatency ? 'selected' : ''} onClick={() => void setStreamQuality(false)}>High</button>
                <button className={activeCamera.lowLatency ? 'selected' : ''} onClick={() => void setStreamQuality(true)}>Low</button>
              </div>
            )}
            <button onClick={() => void toggleStream()} disabled={!activeCamera || busy}>
              {busy ? <Loader2 className="spin" size={18} /> : isStreamEnabled ? <Pause size={18} /> : <Play size={18} />}
              {isStreamEnabled ? 'Disconnect' : 'Connect'}
            </button>
            {activeCamera && isStreamEnabled && <button onClick={reconnectStream} disabled={busy}>Reconnect</button>}
            {activeCamera && isStreamEnabled && fallbackUrl && snapshotUrl !== fallbackUrl && (streamFailure || playback.state === 'stalled' || playback.state === 'error') &&
              <button onClick={() => { releaseCurrentStream(); setStreamFailure(false); setMessage(''); setSnapshotUrl(fallbackUrl); setStreamRevision((value) => value + 1); }}>Use MJPEG fallback</button>}
            {activeCamera && activeCamera.kind !== 'panasonic' && (
              <div className="audio-control" aria-label="Audio volume">
                <button type="button" title={audioMuted ? 'Unmute' : 'Mute'} onClick={() => setAudioMuted((value) => !value)}>
                  {audioMuted || audioVolume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
                </button>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={audioVolume}
                  onChange={(event) => setVolume(Number(event.target.value))}
                  aria-label="Volume"
                />
              </div>
            )}
          </div>
        </header>

        <div
          ref={stageRef}
          className={`video-stage ${digitalZoom > 1 ? 'is-zoomed' : ''}`}
          onMouseDown={startVideoPointer}
          onMouseMove={moveDigitalDrag}
          onMouseUp={stopVideoPointer}
          onMouseLeave={stopVideoPointer}
          onWheelCapture={handleWheel}
        >
          {activeCamera && !snapshotUrl && !isStreamEnabled && <ClickZoneOverlay />}
          {activeCamera ? (
            isStreamEnabled && snapshotUrl && snapshotUrl.includes('/stream.html') ? (
              <iframe
                key={streamSrc()}
                ref={webRtcFrameRef}
                className="snapshot webrtc-frame"
                src={streamSrc()}
                title={`${activeCamera.name} WebRTC live view`}
                allow="autoplay; fullscreen; picture-in-picture"
                allowFullScreen
                style={{
                  transform: `translate(${digitalPan.x}px, ${digitalPan.y}px) scale(${digitalZoom})`,
                  transformOrigin: `${digitalOrigin.x}% ${digitalOrigin.y}%`,
                }}
              />
            ) : snapshotUrl ? (
              <>
                <img
                  key={streamSrc()}
                  ref={(element) => {
                    mediaRef.current = element;
                  }}
                  className="snapshot"
                  src={streamSrc()}
                  style={{
                    transform: `translate(${digitalPan.x}px, ${digitalPan.y}px) scale(${digitalZoom})`,
                    transformOrigin: `${digitalOrigin.x}% ${digitalOrigin.y}%`,
                  }}
                  alt={`${activeCamera.name} live view`}
                    onError={handleStreamError}
                />
              </>
            ) : (
              <div className="stream-placeholder">
                <Camera size={56} />
                <strong>{isStreamEnabled ? 'Preparing playback' : 'Stream disconnected'}</strong>
                <span>{isStreamEnabled ? 'Waiting for video frames.' : 'Press Connect to start live view.'}</span>
                <small>{controls.move ? 'Hold mouse button in the picture to move PTZ. ' : ''}Use the mouse wheel for digital zoom.</small>
              </div>
            )
          ) : (
            <div className="stream-placeholder">
              <WifiOff size={56} />
              <strong>No active camera</strong>
              <span>Use the plus button to add the first Reolink camera.</span>
            </div>
          )}
        </div>

        <footer className="preset-bar">
          <div className="preset-list">
            {presets.map((preset) => (
              <span key={preset.id} className="preset-item">
                <button className="preset-recall" disabled={!controls.presets} onClick={() => void send({ kind: 'preset', presetId: preset.id })}>
                  {preset.name}
                </button>
                {cameraEditMode && controls.presetWrite && (
                  <button
                    className="preset-delete"
                    disabled={!activeCamera || busy}
                    onClick={(event) => {
                      event.stopPropagation();
                      void deletePreset(preset);
                    }}
                    title={`Delete ${preset.name}`}
                    aria-label={`Delete ${preset.name}`}
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </span>
            ))}
            {activeCamera && presets.length === 0 && <span className="hint">No presets loaded yet. Press Test/refresh.</span>}
          </div>
          <div className={`stream-detail ${streamFailure || playback.state === 'error' || playback.state === 'stalled' ? 'bad' : playback.state === 'live' ? 'ok' : ''}`} role="status" aria-label="Playback status">{streamDetail}</div>
          {status?.scope && <span className={`camera-test-result ${status.scope === 'unverified' ? '' : status.ok ? 'ok' : 'bad'}`} aria-label="Camera test result">{status.message}</span>}
          <div className={`status ${configurationError ? 'bad' : ''}`}>
            {configurationError || message || (status?.scope ? '' : status?.message) || (!activeCamera ? 'No camera' : '')}
          </div>
          {activeCamera && tlsProblem?.owner === cameraWork && <div className="certificate-problem" role="alert">
            <strong>{tlsProblem.protocol === 'HTTPS' ? 'Camera controls need certificate approval.' : 'Stream certificate needs approval.'}</strong>
            <span>{tlsProblem.protocol === 'HTTPS' ? 'Video may still work because it uses a separate connection. ' : ''}Inspect the certificate, verify its fingerprint, then save the camera. A changed certificate must be verified again.</span>
            <button type="button" onClick={() => editCamera(activeCamera, true)}>Review {tlsProblem.protocol} certificate</button>
          </div>}
        </footer>
      </section>

      {showTips && (
        <div className="tips-popover" role="dialog" aria-label="Tips">
          <div className="tips-heading">
            <strong>Tips</strong>
            <button type="button" className="icon-button" title="Close tips" onClick={() => setShowTips(false)}>
              X
            </button>
          </div>
          <span><kbd>Enter</kbd> toggles fullscreen.</span>
          <span><kbd>Page Up</kbd> selects the next camera. <kbd>Page Down</kbd> selects the previous camera.</span>
          <span><kbd>←</kbd> <kbd>↑</kbd> <kbd>↓</kbd> <kbd>→</kbd>, <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>, or the numpad moves PTZ cameras.</span>
          <span><kbd>1</kbd>-<kbd>9</kbd> recalls PTZ preset 1-9. <kbd>0</kbd> recalls preset 10.</span>
          <span><kbd>+</kbd> and <kbd>-</kbd> adjust PTZ speed.</span>
          <span>Numpad <kbd>/</kbd> and <kbd>*</kbd> adjust optical zoom in larger steps.</span>
          <span>Numpad <kbd>,</kbd> toggles camera audio mute.</span>
          <span>The PTZ optical zoom slider sets the camera zoom position directly when supported.</span>
          <span><strong>MSE</strong> means Media Source Extensions. It is the browser player go2rtc often uses when audio compatibility is better than RTC.</span>
          <span><strong>RTC</strong> means WebRTC. It is usually the lowest-latency player.</span>
        </div>
      )}

      {showAbout && (
        <Modal title="About Fjoscam" onClose={() => setShowAbout(false)}>
          <div className="small-modal" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-heading">
              <h2>About Fjoscam</h2>
              <button type="button" className="icon-button" aria-label="Close About Fjoscam" onClick={() => setShowAbout(false)}>
                ×
              </button>
            </div>
            <p>Fjoscam {appVersion || '1.0.0'}</p>
            <p className="muted-text">Low-latency Reolink LAN viewer.</p>
            <div className="modal-actions">
              <button type="button" onClick={() => void checkForUpdates()}>Check for updates</button>
              <button type="button" disabled={exportingDiagnostics} onClick={() => {
                setExportingDiagnostics(true); setDiagnosticStatus('');
                void window.fjoscam.exportDiagnostics().then((saved) => setDiagnosticStatus(saved ? 'Diagnostic report saved.' : 'Export cancelled.'),
                  () => setDiagnosticStatus('Could not save the diagnostic report. Try another folder.'))
                  .finally(() => setExportingDiagnostics(false));
              }}>Save diagnostics...</button>
            </div>
            <p className="muted-text">The report includes app/runtime versions and camera setting categories. It excludes camera addresses, names, usernames, credentials, images and logs. Nothing is uploaded.</p>
            {diagnosticStatus && <p role="status">{diagnosticStatus}</p>}
            <section className="donation-section">
              <h3>Support development</h3>
              <p>
                If you enjoy this project and would like to support future development, donations are appreciated — but never expected.
              </p>
              <p>
                Your contribution helps fund time spent on coding, testing, bug fixes, and new features across current and future open-source projects.
              </p>
              <p>Thank you for your support.</p>
              <div className="modal-actions donation-actions">
                <a
                  className="donation-button"
                  href="https://www.paypal.com/paypalme/rvenes"
                  target="_blank"
                  rel="noreferrer"
                >
                  Donate with PayPal
                </a>
              </div>
            </section>
          </div>
        </Modal>
      )}

      {showPresetDialog && (
        <Modal title="Save PTZ preset" onClose={() => setShowPresetDialog(false)}>
          <form
            className="small-modal preset-modal"
            onMouseDown={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              void saveCurrentPreset();
            }}
          >
            <div className="modal-heading">
              <h2>Save PTZ preset</h2>
              <button type="button" className="icon-button" aria-label="Close preset dialog" onClick={() => setShowPresetDialog(false)}>
                ×
              </button>
            </div>
            <p className="muted-text">Save the current camera position. Existing presets with the same number will be overwritten.</p>
            <div className="form-grid preset-form">
              <label>Preset number<input type="number" min="1" max="64" value={presetDraftId} onChange={(event) => setPresetDraftId(Number(event.target.value))} /></label>
              <label>Preset name<input value={presetDraftName} onChange={(event) => setPresetDraftName(event.target.value)} /></label>
            </div>
            <div className="modal-actions">
              <button type="button" onClick={() => setShowPresetDialog(false)}>Cancel</button>
              <button type="submit" disabled={busy}>{busy ? 'Saving...' : 'Save preset'}</button>
            </div>
          </form>
        </Modal>
      )}

      {showUpdateDialog && updateStatus && (
        <Modal title="Fjoscam update" onClose={() => setShowUpdateDialog(false)}>
          <div className="small-modal" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-heading">
              <h2>Fjoscam update</h2>
              <button type="button" className="icon-button" aria-label="Close update dialog" onClick={() => setShowUpdateDialog(false)}>
                ×
              </button>
            </div>
            <p>{updateMessage(updateStatus)}</p>
            {updateStatus.state === 'downloading' && (
              <progress className="update-progress" max="100" value={Math.round(updateStatus.percent ?? 0)} />
            )}
            <div className="modal-actions">
              {updateStatus.state === 'available' && <button type="button" onClick={() => void downloadUpdate()}>Last ned</button>}
              {updateStatus.state === 'downloaded' && <button type="button" onClick={() => void installUpdate()}>Installer og start på nytt</button>}
              {['idle', 'not-available', 'error'].includes(updateStatus.state) && (
                <button type="button" onClick={() => void checkForUpdates()}>Sjekk igjen</button>
              )}
              <button type="button" onClick={() => setShowUpdateDialog(false)}>Lukk</button>
            </div>
          </div>
        </Modal>
      )}

      {showSettings && (
        <Modal title={editingId ? 'Edit camera' : 'Add camera'} onClose={closeSettings}>
          <form className="settings-modal" onMouseDown={(event) => event.stopPropagation()} onSubmit={(event) => void saveCamera(event)}>
            <div className="modal-heading">
              <h2>{editingId ? 'Edit camera' : 'Add camera'}</h2>
              <button type="button" className="icon-button" aria-label="Close camera settings" onClick={closeSettings}>
                ×
              </button>
            </div>
            {!editingId && (
              <CameraDiscovery existingHosts={existingCameraHosts} onSelect={useDiscoveredCamera} />
            )}
            <div className="form-grid">
              <label>Camera type<select value={form.kind} onChange={(event) => setCameraKind(event.target.value as CameraInput['kind'])}><option value="reolink">Reolink LAN camera</option><option value="panasonic">Panasonic legacy MJPEG</option><option value="generic">Generic RTSP/RTSPS stream</option></select></label>
              <label>Name<span className="input-action"><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /><button type="button" onClick={() => void fetchCameraName()} disabled={busy}>Fetch</button></span></label>
              <label>IP / host<input readOnly={form.kind === 'generic'} value={form.host} onChange={(event) => setForm({ ...form, host: event.target.value, httpsTrust: undefined, allowInsecureOnvif: false })} /></label>
              <label>Protocol<select value={form.protocol} onChange={(event) => setForm({ ...form, protocol: event.target.value as 'http' | 'https', httpsTrust: undefined })}><option>http</option><option>https</option></select></label>
              <label>HTTP port<input type="number" value={form.httpPort} onChange={(event) => setForm({ ...form, httpPort: Number(event.target.value), httpsTrust: undefined })} /></label>
              {form.kind === 'generic' ? (
                <label className="wide-field">Stream URL
                  <input type="password" autoComplete="new-password" spellCheck={false} value={form.streamUrl ?? ''}
                    placeholder={editingId && state.cameras.find((camera) => camera.id === editingId)?.hasStreamUrl ? 'Leave blank to keep saved URL' : 'rtsp:// or rtsps:// address'}
                    onChange={(event) => setForm({ ...form, streamUrl: event.target.value, rtspsTrust: undefined, host: inferHostFromStreamUrl(event.target.value) || form.host })} />
                  <small>{editingId && state.cameras.find((camera) => camera.id === editingId)?.hasStreamUrl
                    ? 'A stream URL is saved. Leave this field blank to keep it, or enter a complete replacement.'
                    : 'The complete address is stored encrypted for this OS account.'}</small>
                </label>
              ) : form.kind === 'reolink' ? (
                <>
                  <label>RTSP port<input type="number" value={form.rtspPort} onChange={(event) => setForm({ ...form, rtspPort: Number(event.target.value) })} /></label>
                  <label>Control channel<input type="number" min="0" value={form.channel} onChange={(event) => setForm({ ...form, channel: Number(event.target.value) })} /></label>
                  <label>View channel<input type="number" min="0" value={form.streamChannel} onChange={(event) => setForm({ ...form, streamChannel: Number(event.target.value) })} /></label>
                  <label>Lens controls<select value={form.lensMode ?? 'auto'} onChange={(event) => setForm({ ...form, lensMode: event.target.value as CameraInput['lensMode'] })}><option value="auto">Auto (reported model)</option><option value="single">Single / NVR channel</option><option value="dual">Dual lens (Wide 0 / Zoom 1)</option></select></label>
                </>
              ) : (
                <>
                  <label className="wide-field">MJPEG path<input value={form.mjpegPath ?? ''} onChange={(event) => setForm({ ...form, mjpegPath: event.target.value })} /></label>
                  <label className="wide-field">PTZ path<input value={form.ptzPath ?? ''} onChange={(event) => setForm({ ...form, ptzPath: event.target.value })} /></label>
                </>
              )}
              {form.kind !== 'generic' && (
                <>
                  <label>Username<input value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} /></label>
                  <label>Password<input type="password" value={form.password} placeholder={editingId ? 'Enter to replace saved password' : ''} onChange={(event) => setForm({ ...form, password: event.target.value })} /></label>
                </>
              )}
            </div>
            {form.kind !== 'generic' && form.protocol === 'https' && <CameraTlsSettings highlighted={highlightCertificate} key={editingId ?? 'new'} target={form} trust={form.httpsTrust} onChange={(httpsTrust) => setForm((current) => ({ ...current, httpsTrust }))} />}
            {form.kind === 'generic' && <CameraTlsSettings highlighted={highlightCertificate} key={`stream-${editingId ?? 'new'}`} stream={{ url: form.streamUrl ?? '', cameraId: editingId }} trust={form.rtspsTrust} onChange={(rtspsTrust) => setForm((current) => ({ ...current, rtspsTrust }))} />}
            {form.kind === 'reolink' && <section className="camera-onvif" aria-label="ONVIF fallback">
              <label className="check-row">
                <input type="checkbox" checked={form.allowInsecureOnvif === true} onChange={(event) => setForm({ ...form, allowInsecureOnvif: event.target.checked })} />
                Allow unencrypted ONVIF PTZ fallback
              </label>
              <p>Enable only on a trusted local network if Reolink API movement fails. ONVIF sends authentication data and camera commands over HTTP, even when HTTPS is selected above. Certificate errors never trigger this fallback.</p>
              {form.allowInsecureOnvif === true && <label>ONVIF HTTP port<input type="number" min="1" max="65535" value={form.onvifPort ?? 8000} onChange={(event) => setForm({ ...form, onvifPort: Number(event.target.value) })} /></label>}
            </section>}
            {form.kind === 'reolink' && (
              <label className="check-row wide-field">
                <input type="checkbox" checked={form.lowLatency} onChange={(event) => setForm({ ...form, lowLatency: event.target.checked })} />
                Start this camera on Low/Fluent
              </label>
            )}
            <div className="modal-actions">
              {activeCamera && <button type="button" onClick={() => editCamera(activeCamera)}>Edit active</button>}
              <button type="submit" disabled={busy}>{busy ? 'Saving...' : highlightCertificate ? 'Save camera and retry' : 'Save camera'}</button>
            </div>
            {(configurationError || message) && <p className="form-message">{configurationError || message}</p>}
          </form>
        </Modal>
      )}
    </main>
  );
}

function ClickZoneOverlay() {
  return (
    <div className="click-zone-overlay" aria-hidden="true">
      {clickZones.flatMap((row, y) =>
        row.map((label, x) => {
          const center = x === 2 && y === 2;
          const outer = x === 0 || x === 4 || y === 0 || y === 4;
          return (
            <span className={`click-zone ${center ? 'dead' : outer ? 'strong' : 'soft'}`} key={`${x}-${y}`}>
              {label}
            </span>
          );
        }),
      )}
    </div>
  );
}


function irOptionLabel(mode: IrLightMode): string {
  switch (mode) {
    case 'auto':
      return 'Auto';
    case 'on':
      return 'On';
    case 'off':
      return 'Off';
  }
}

function updateMessage(status: UpdateStatus): string {
  switch (status.state) {
    case 'idle':
      return `Fjoscam ${status.currentVersion}`;
    case 'checking':
      return 'Sjekkar etter oppdatering...';
    case 'available':
      return `Ny versjon ${status.version} er klar. Du har ${status.currentVersion}.`;
    case 'not-available':
      return `Du har siste versjon (${status.currentVersion}).`;
    case 'downloading':
      return `Lastar ned ${status.version ?? 'oppdatering'}... ${Math.round(status.percent ?? 0)}%`;
    case 'downloaded':
      return `Versjon ${status.version} er lasta ned og klar til installasjon.`;
    case 'installing':
      return `Klargjer versjon ${status.version} for installasjon. Avsluttar kameratilkoplingane...`;
    case 'error':
      return status.message;
  }
}

function cameraSubtitle(camera: CameraConfig, hasSecondaryLens: boolean): string {
  if (camera.kind === 'generic') return 'Generic RTSP/RTSPS stream';
  if (camera.kind === 'panasonic') return 'Panasonic MJPEG';
  return `${hasSecondaryLens ? ((camera.streamChannel ?? 0) === 1 ? 'Zoom lens' : 'Wide lens') : 'Camera'} · ${camera.lowLatency ? 'Low/Fluent' : 'High/Clear'}`;
}

function zoomPositionLabel(position: number, range: ZoomRange): string {
  const span = range.max - range.min;
  if (span <= 0) return '0%';
  const percent = Math.round((clamp(position, range.min, range.max) - range.min) / span * 100);
  return `${percent}%`;
}

function inferHostFromStreamUrl(value: string): string {
  try {
    return new URL(value).hostname;
  } catch {
    return value.replace(/^[a-z]+:\/\//i, '').replace(/\/.*$/, '').replace(/:\d+$/, '');
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getMediaViewportRect(stage: HTMLDivElement, media: HTMLImageElement | HTMLVideoElement): DOMRect {
  const stageBounds = stage.getBoundingClientRect();
  const mediaWidth = media instanceof HTMLVideoElement ? media.videoWidth : media.naturalWidth;
  const mediaHeight = media instanceof HTMLVideoElement ? media.videoHeight : media.naturalHeight;

  if (!mediaWidth || !mediaHeight) return stageBounds;

  const scale = Math.min(stageBounds.width / mediaWidth, stageBounds.height / mediaHeight);
  const width = mediaWidth * scale;
  const height = mediaHeight * scale;
  const left = stageBounds.left + (stageBounds.width - width) / 2;
  const top = stageBounds.top + (stageBounds.height - height) / 2;

  return new DOMRect(left, top, width, height);
}

function clampPan(pan: { x: number; y: number }, zoom: number, bounds: DOMRect): { x: number; y: number } {
  if (zoom <= 1) return { x: 0, y: 0 };
  const maxX = Math.max(0, (bounds.width * (zoom - 1)) / 2);
  const maxY = Math.max(0, (bounds.height * (zoom - 1)) / 2);
  return {
    x: clamp(pan.x, -maxX, maxX),
    y: clamp(pan.y, -maxY, maxY),
  };
}

function numpadDirection(code: string): PtzDirection | null {
  switch (code) {
    case 'Numpad7':
      return 'LeftUp';
    case 'Numpad8':
    case 'ArrowUp':
    case 'KeyW':
      return 'Up';
    case 'Numpad9':
      return 'RightUp';
    case 'Numpad4':
    case 'ArrowLeft':
    case 'KeyA':
      return 'Left';
    case 'Numpad6':
    case 'ArrowRight':
    case 'KeyD':
      return 'Right';
    case 'Numpad1':
      return 'LeftDown';
    case 'Numpad2':
    case 'ArrowDown':
    case 'KeyS':
      return 'Down';
    case 'Numpad3':
      return 'RightDown';
    default:
      return null;
  }
}

function nextPresetId(presets: Preset[]): number {
  const used = new Set(presets.map((preset) => preset.id));
  for (let id = 1; id <= 64; id += 1) {
    if (!used.has(id)) return id;
  }
  return 1;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable;
}

function formatStreamInfo(info?: StreamInfo): string {
  if (!info) return '';
  const parts = [
    info.resolution,
    info.fps ? `${info.fps} FPS` : '',
    info.bitrateKbps ? `${info.bitrateKbps} Kbps` : '',
    info.codec?.toUpperCase() ?? '',
  ].filter(Boolean);
  return parts.length ? ` · ${parts.join(' · ')}` : '';
}

createRoot(document.getElementById('root')!).render(<App />);

function capabilitySummary(profile?: CameraProfile): string {
  if (!profile) return 'Camera controls are not confirmed. Refresh to retry.';
  const status = Object.values(profile.capabilities.status ?? {});
  if (status.some((value) => value === 'denied' || value === 'read-only')) return 'Some controls are unavailable for this camera account (read-only or no permission).';
  if (status.includes('unknown')) return 'Some camera controls could not be confirmed. Refresh to retry.';
  return 'Only controls reported by the camera are enabled.';
}
