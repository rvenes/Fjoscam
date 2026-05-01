import { FormEvent, MouseEvent, WheelEvent, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowDown, ArrowDownLeft, ArrowDownRight, ArrowLeft, ArrowRight, ArrowUp, ArrowUpLeft, ArrowUpRight, Camera, CheckCircle2, Crosshair, Eye, Focus, Loader2, Pause, Play, Plus, Radio, RotateCcw, Trash2, Volume2, VolumeX, WifiOff, ZoomIn, ZoomOut } from 'lucide-react';
import type { AppState, CameraConfig, CameraDiscoveryResult, CameraInput, CameraProfile, ConnectionStatus, IrLightMode, Preset, PtzCommand, PtzDirection, StreamInfo, UpdateStatus, WhiteLedState } from '../shared/types';
import { clickToPtzCommand } from '../shared/ptz';
import './styles.css';

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
  const [discoveredCameras, setDiscoveredCameras] = useState<CameraDiscoveryResult[]>([]);
  const [discoveryBusy, setDiscoveryBusy] = useState(false);
  const [discoveryMessage, setDiscoveryMessage] = useState('');
  const [showTips, setShowTips] = useState(false);
  const [cameraEditMode, setCameraEditMode] = useState(false);
  const [ptzExpanded, setPtzExpanded] = useState(false);
  const [controlsExpanded, setControlsExpanded] = useState(false);
  const [viewerFullscreen, setViewerFullscreen] = useState(false);
  const [appVersion, setAppVersion] = useState('');
  const [showAbout, setShowAbout] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [showUpdateDialog, setShowUpdateDialog] = useState(false);
  const [showPresetDialog, setShowPresetDialog] = useState(false);
  const [presetDraftId, setPresetDraftId] = useState(1);
  const [presetDraftName, setPresetDraftName] = useState('Preset 1');
  const [speed, setSpeed] = useState(30);
  const [focusSpeed, setFocusSpeed] = useState(20);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [streamInfo, setStreamInfo] = useState<{ high?: StreamInfo; low?: StreamInfo }>({});
  const [profile, setProfile] = useState<CameraProfile | undefined>();
  const [irMode, setIrMode] = useState<IrLightMode | undefined>();
  const [whiteLed, setWhiteLed] = useState<WhiteLedState | undefined>();
  const [snapshotUrl, setSnapshotUrl] = useState('');
  const [fallbackUrl, setFallbackUrl] = useState('');
  const [isStreamEnabled, setIsStreamEnabled] = useState(true);
  const [streamRevision, setStreamRevision] = useState(0);
  const [digitalZoom, setDigitalZoom] = useState(1);
  const [opticalZoomPosition, setOpticalZoomPosition] = useState(0);
  const [audioMuted, setAudioMuted] = useState(true);
  const [audioVolume, setAudioVolume] = useState(60);
  const [digitalPan, setDigitalPan] = useState({ x: 0, y: 0 });
  const [digitalOrigin, setDigitalOrigin] = useState({ x: 50, y: 50 });
  const stageRef = useRef<HTMLDivElement | null>(null);
  const mediaRef = useRef<HTMLImageElement | HTMLVideoElement | null>(null);
  const webRtcFrameRef = useRef<HTMLIFrameElement | null>(null);
  const audioApplyTimerRef = useRef<number | null>(null);
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
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const activeCamera = useMemo(
    () => state.cameras.find((camera) => camera.id === state.activeCameraId) ?? null,
    [state],
  );
  const existingCameraHosts = useMemo(() => new Set(state.cameras.map((camera) => camera.host).filter(Boolean)), [state.cameras]);
  const isReolinkCamera = !activeCamera?.kind || activeCamera.kind === 'reolink';
  const hasSecondaryLens = activeCamera ? supportsSecondaryLens(activeCamera) : false;

  useEffect(() => {
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
      setUpdateStatus(nextStatus);
      setShowUpdateDialog(true);
    });
    const removeAboutListener = window.fjoscam.onOpenAbout((version) => {
      setAppVersion(version);
      setShowAbout(true);
    });
    return () => {
      if (audioApplyTimerRef.current !== null) window.clearTimeout(audioApplyTimerRef.current);
      removeOpenPanelListener();
      removeCameraEditListener();
      removeUpdateListener();
      removeAboutListener();
    };
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
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

      const presetIndex = presetIndexFromKey(event.code);
      if (presetIndex !== null) {
        event.preventDefault();
        const preset = presets[presetIndex];
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
        if (!event.repeat && isReolinkCamera) void nudgeOpticalZoom(-5);
        return;
      }

      if (event.code === 'NumpadMultiply') {
        event.preventDefault();
        if (!event.repeat && isReolinkCamera) void nudgeOpticalZoom(5);
        return;
      }

      if (event.code === 'NumpadDecimal') {
        event.preventDefault();
        if (!event.repeat && activeCamera.kind !== 'panasonic') setAudioMuted((value) => !value);
        return;
      }

    }

    function handleKeyUp(event: KeyboardEvent) {
      if (isEditableTarget(event.target) || !activeCamera) return;
      if (numpadDirection(event.code)) {
        event.preventDefault();
        void send({ kind: 'stop' });
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [activeCamera, isReolinkCamera, opticalZoomPosition, presets, speed, state.cameras, viewerFullscreen]);

  useEffect(() => {
    if (!activeCamera) {
      setPresets([]);
      setStreamInfo({});
      setProfile(undefined);
      setIrMode(undefined);
      setWhiteLed(undefined);
      setSnapshotUrl('');
      setFallbackUrl('');
      setStatus(null);
      setMessage('');
      return;
    }
    void loadCameraProfile(activeCamera.id);
    if (!isStreamEnabled) {
      clearCurrentStream();
      setMessage('Disconnected');
      setStatus(null);
      return;
    }
    void loadWebRtcRuntime(activeCamera.id);
  }, [activeCamera?.id, activeCamera?.streamChannel, activeCamera?.lowLatency, isStreamEnabled]);

  useEffect(() => {
    if (!showSettings || editingId) return;
    void scanForCameras();
  }, [showSettings, editingId]);

  useEffect(() => {
    applyWebRtcAudioSettings();
  }, [audioMuted, audioVolume, snapshotUrl]);

  useEffect(() => {
    if (!activeCamera || !isReolinkCamera) {
      setOpticalZoomPosition(0);
      return;
    }
    let cancelled = false;
    window.fjoscam.getZoomFocus(activeCamera.id)
      .then((value) => {
        if (!cancelled && typeof value.zoom === 'number') setOpticalZoomPosition(clamp(value.zoom, 0, 34));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [activeCamera?.id, isReolinkCamera]);

  async function loadCameraProfile(id: string) {
    const camera = state.cameras.find((item) => item.id === id);
    if (camera?.kind !== 'reolink') {
      setProfile(undefined);
      setIrMode(undefined);
      setWhiteLed(undefined);
      return;
    }
    const nextProfile = await window.fjoscam.getProfile(id);
    setProfile(nextProfile);
    if (nextProfile?.capabilities.irLights) setIrMode(await window.fjoscam.getIrLights(id));
    else setIrMode(undefined);
    setWhiteLed(await window.fjoscam.getWhiteLed(id));
  }

  async function refresh() {
    setState(await window.fjoscam.getState());
  }

  async function scanForCameras() {
    setDiscoveryBusy(true);
    setDiscoveryMessage('Searching local network...');
    try {
      const results = await window.fjoscam.discoverCameras();
      setDiscoveredCameras(results);
      setDiscoveryMessage(results.length > 0 ? `Found ${results.length} camera${results.length === 1 ? '' : 's'}.` : 'No cameras found. You can still add one manually.');
    } catch (error) {
      setDiscoveryMessage(errorMessage(error));
    } finally {
      setDiscoveryBusy(false);
    }
  }

  async function setFullscreenMode(enabled: boolean) {
    setViewerFullscreen(enabled);
    await window.fjoscam.setFullscreen(enabled);
  }

  async function checkForUpdates() {
    setShowUpdateDialog(true);
    setUpdateStatus(await window.fjoscam.checkForUpdates());
  }

  async function downloadUpdate() {
    setUpdateStatus(await window.fjoscam.downloadUpdate());
  }

  async function installUpdate() {
    await window.fjoscam.quitAndInstallUpdate();
  }

  async function selectAdjacentCamera(direction: -1 | 1) {
    if (state.cameras.length === 0) return;
    const currentIndex = Math.max(0, state.cameras.findIndex((camera) => camera.id === state.activeCameraId));
    const nextIndex = (currentIndex + direction + state.cameras.length) % state.cameras.length;
    await selectCamera(state.cameras[nextIndex].id);
  }

  async function loadWebRtcRuntime(id: string) {
    const loadId = runtimeLoadRef.current + 1;
    runtimeLoadRef.current = loadId;
    setMessage('Starting WebRTC live...');
    setStatus(null);
    try {
      setFallbackUrl('');
      setSnapshotUrl('');
      const camera = state.cameras.find((item) => item.id === id);
      if (camera?.kind === 'panasonic') {
        const mjpegUrl = await window.fjoscam.getMjpegUrl(id);
        if (runtimeLoadRef.current !== loadId) return;
        setSnapshotUrl(mjpegUrl);
        setPresets(Array.from({ length: 10 }, (_item, index) => ({ id: index + 1, name: `Preset ${index + 1}` })));
        setStreamInfo({});
        setStreamRevision((value) => value + 1);
        setMessage('Panasonic MJPEG live');
        setStatus({ ok: true, message: 'Panasonic MJPEG live' });
        return;
      }
      if (camera?.kind === 'generic') {
        const webRtcStream = await window.fjoscam.getWebRtcStream(id);
        if (runtimeLoadRef.current !== loadId) return;
        setSnapshotUrl(webRtcStream.pageUrl);
        setPresets([]);
        setStreamInfo({});
        setProfile(undefined);
        setFallbackUrl('');
        setStreamRevision((value) => value + 1);
        setMessage('Generic WebRTC live');
        setStatus({ ok: true, message: 'Generic WebRTC live' });
        return;
      }
      const nextStreamInfo: { high?: StreamInfo; low?: StreamInfo } = await window.fjoscam.getStreamInfo(id).catch(() => ({}));
      if (runtimeLoadRef.current !== loadId) return;
      setStreamInfo(nextStreamInfo);

      const webRtcStream = await window.fjoscam.getWebRtcStream(id);
      if (runtimeLoadRef.current !== loadId) return;
      setSnapshotUrl(webRtcStream.pageUrl);
      setStreamRevision((value) => value + 1);
      setMessage('WebRTC live');
      setStatus({ ok: true, message: 'WebRTC live' });

      const [nextPresets, nextFallbackUrl] = await Promise.all([
        window.fjoscam.getPresets(id).catch(() => []),
        window.fjoscam.getMjpegUrl(id).catch(() => ''),
      ]);
      if (runtimeLoadRef.current !== loadId) return;
      setPresets(nextPresets);
      setStreamInfo(nextStreamInfo);
      setFallbackUrl(nextFallbackUrl);
    } catch (error) {
      setMessage(errorMessage(error));
    }
  }

  async function saveCamera(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const nextState = await window.fjoscam.saveCamera(form, editingId);
      setState(nextState);
      setForm(defaultInput);
      setEditingId(undefined);
      setShowSettings(false);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function selectCamera(id: string) {
    setState(await window.fjoscam.setActiveCamera(id));
  }

  async function setViewChannel(channel: number) {
    if (!activeCamera) return;
    clearCurrentStream();
    const nextState = await window.fjoscam.setStreamChannel(activeCamera.id, channel);
    setState(nextState);
    resetDigitalZoom();
    if (isStreamEnabled) window.setTimeout(() => void loadWebRtcRuntime(activeCamera.id), 120);
  }

  async function setStreamQuality(lowLatency: boolean) {
    if (!activeCamera) return;
    clearCurrentStream();
    const nextState = await window.fjoscam.setStreamQuality(activeCamera.id, lowLatency);
    setState(nextState);
    resetDigitalZoom();
    if (isStreamEnabled) window.setTimeout(() => void loadWebRtcRuntime(activeCamera.id), 120);
  }

  async function testCamera(id = activeCamera?.id) {
    if (!id) return;
    setBusy(true);
    setMessage('');
    try {
      const result = await window.fjoscam.testCamera(id);
      setStatus(result);
      if (result.presets) setPresets(result.presets);
      if (result.streams) setStreamInfo(result.streams);
      if (result.cameraName && activeCamera && activeCamera.name !== result.cameraName) {
        const nextState = await window.fjoscam.saveCamera(
          {
            ...activeCamera,
            name: result.cameraName,
            password: '',
          },
          activeCamera.id,
        );
        setState(nextState);
      }
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function toggleStream() {
    if (!activeCamera) return;
    if (isStreamEnabled) {
      setIsStreamEnabled(false);
      clearCurrentStream();
      setMessage('Disconnected');
      setStatus(null);
      return;
    }

    setIsStreamEnabled(true);
    await loadWebRtcRuntime(activeCamera.id);
  }

  async function removeCamera(id: string) {
    const camera = state.cameras.find((item) => item.id === id);
    const name = camera?.name ?? 'this camera';
    const confirmed = window.confirm(`Delete camera "${name}" from Fjoscam?\n\nThis only removes it from Fjoscam. The camera itself is not changed.`);
    if (!confirmed) return;
    setState(await window.fjoscam.removeCamera(id));
    setMessage(`Deleted ${name}`);
  }

  async function moveCamera(id: string, direction: -1 | 1) {
    const index = state.cameras.findIndex((camera) => camera.id === id);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= state.cameras.length) return;
    const nextCameras = [...state.cameras];
    [nextCameras[index], nextCameras[targetIndex]] = [nextCameras[targetIndex], nextCameras[index]];
    setState(await window.fjoscam.reorderCameras(nextCameras.map((camera) => camera.id)));
  }

  async function changeIrMode(mode: IrLightMode) {
    if (!activeCamera) return;
    setMessage('Updating IR lights...');
    try {
      await window.fjoscam.setIrLights(activeCamera.id, mode);
      setIrMode(mode);
      setMessage('IR lights updated');
    } catch (error) {
      setMessage(errorMessage(error));
    }
  }

  async function setCameraLight(enabled: boolean, brightness = whiteLed?.brightness) {
    if (!activeCamera) return;
    const nextBrightness = enabled ? (brightness && brightness > 0 ? brightness : 85) : 0;
    setMessage('Updating spotlight...');
    try {
      await window.fjoscam.setWhiteLed(activeCamera.id, enabled, nextBrightness);
      setWhiteLed({ ...whiteLed, enabled, brightness: nextBrightness });
      setMessage(enabled ? 'Spotlight on' : 'Spotlight off');
    } catch (error) {
      setMessage(errorMessage(error));
    }
  }

  async function setCameraLightBrightness(brightness: number) {
    if (!activeCamera) return;
    const enabled = brightness > 0;
    setWhiteLed({ ...whiteLed, enabled, brightness, supportsBrightness: true });
    try {
      await window.fjoscam.setWhiteLed(activeCamera.id, enabled, brightness);
      setMessage(`Spotlight brightness ${brightness}%`);
    } catch (error) {
      setMessage(errorMessage(error));
    }
  }

  async function playSiren() {
    if (!activeCamera) return;
    const confirmed = window.confirm(`Play siren on "${activeCamera.name}"?`);
    if (!confirmed) return;
    setMessage('Playing siren...');
    try {
      await window.fjoscam.playSiren(activeCamera.id);
      setMessage('Siren command sent');
    } catch (error) {
      setMessage(errorMessage(error));
    }
  }

  async function fetchCameraName() {
    setBusy(true);
    setMessage('');
    try {
      const cameraName = await window.fjoscam.getDeviceName(form);
      if (!cameraName) {
        setMessage('Camera did not return a name.');
        return;
      }
      setForm({ ...form, name: cameraName });
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  function useDiscoveredCamera(camera: CameraDiscoveryResult) {
    const httpPort = camera.ports.https ?? camera.ports.http ?? 80;
    const isPanasonic = camera.host === '10.0.0.83';
    setForm({
      ...form,
      kind: isPanasonic ? 'panasonic' : 'reolink',
      name: isPanasonic ? 'Panasonic' : discoveryDisplayName(camera),
      host: camera.host,
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

  function editCamera(camera: CameraConfig) {
    setForm({
      ...camera,
      kind: camera.kind ?? 'reolink',
      streamChannel: camera.streamChannel ?? camera.channel,
      password: '',
    });
    setEditingId(camera.id);
    setShowSettings(true);
  }

  async function send(command: PtzCommand) {
    if (!activeCamera || activeCamera.kind === 'generic') return;
    try {
      await window.fjoscam.sendPtz(activeCamera.id, command);
    } catch (error) {
      setMessage(errorMessage(error));
    }
  }

  async function zoomStep(direction: 'in' | 'out') {
    await send({ kind: 'zoom', direction, speed });
    window.setTimeout(() => void send({ kind: 'stop' }), 180);
  }

  async function setOpticalZoomPositionValue(position: number) {
    const nextPosition = clamp(Math.round(position), 0, 34);
    setOpticalZoomPosition(nextPosition);
    await send({ kind: 'zoomPosition', position: nextPosition });
  }

  async function nudgeOpticalZoom(delta: number) {
    await setOpticalZoomPositionValue(opticalZoomPosition + delta);
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
    if (!activeCamera || !isReolinkCamera) return;
    const presetId = Number(presetDraftId);
    if (!Number.isFinite(presetId) || presetId < 1 || presetId > 64) {
      setMessage('Preset number must be between 1 and 64.');
      setStatus({ ok: false, message: 'Preset number must be between 1 and 64.' });
      return;
    }

    const name = presetDraftName.trim() || `Preset ${Math.round(presetId)}`;

    setBusy(true);
    setMessage('Saving preset...');
    try {
      const nextPresets = await window.fjoscam.savePreset(activeCamera.id, presetId, name);
      setPresets(nextPresets);
      setShowPresetDialog(false);
      setStatus({ ok: true, message: `Saved preset ${Math.round(presetId)}` });
      setMessage(`Saved preset ${Math.round(presetId)}`);
    } catch (error) {
      const message = errorMessage(error);
      setStatus({ ok: false, message });
      setMessage(message);
    } finally {
      setBusy(false);
    }
  }

  async function deletePreset(preset: Preset) {
    if (!activeCamera || !isReolinkCamera) return;
    const confirmed = window.confirm(`Delete "${preset.name}"?`);
    if (!confirmed) return;

    setBusy(true);
    setMessage(`Deleting preset ${preset.id}...`);
    try {
      const nextPresets = await window.fjoscam.deletePreset(activeCamera.id, preset.id);
      setPresets(nextPresets);
      setStatus({ ok: true, message: `Deleted preset ${preset.id}` });
      setMessage(`Deleted preset ${preset.id}`);
    } catch (error) {
      const message = errorMessage(error);
      setStatus({ ok: false, message });
      setMessage(message);
    } finally {
      setBusy(false);
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

  async function toggleZoomChannel() {
    if (!activeCamera || !hasSecondaryLens) return;
    await setViewChannel((activeCamera.streamChannel ?? 0) === 1 ? 0 : 1);
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

    const originX = ((event.clientX - bounds.left) / bounds.width) * 100;
    const originY = ((event.clientY - bounds.top) / bounds.height) * 100;
    const nextZoom = clamp(digitalZoom + (event.deltaY < 0 ? 0.18 : -0.18), 1, 4);

    if (nextZoom === 1) {
      resetDigitalZoom();
      return;
    }

    setDigitalZoom(nextZoom);
    setDigitalOrigin({ x: clamp(originX, 0, 100), y: clamp(originY, 0, 100) });
    setDigitalPan((current) => clampPan(current, nextZoom, bounds));
  }

  function setDigitalZoomLevel(nextZoom: number) {
    const zoom = clamp(nextZoom, 1, 4);
    if (zoom === 1) {
      resetDigitalZoom();
      return;
    }
    setDigitalZoom(zoom);
    setDigitalOrigin({ x: 50, y: 50 });
    setDigitalPan({ x: 0, y: 0 });
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
    ? isStreamEnabled && snapshotUrl
      ? `${activeCamera.kind === 'panasonic' ? 'Panasonic MJPEG live' : `WebRTC live${formatStreamInfo(activeStreamInfo)}`}${digitalZoom > 1 ? ` · Digital zoom ${digitalZoom.toFixed(1)}x` : ''}`
      : 'Stream disconnected'
    : '';

  function handleStreamError() {
    if (!isStreamEnabled) return;
    if (fallbackUrl) {
      setSnapshotUrl(fallbackUrl);
      setMessage('WebRTC stream unavailable. Showing MJPEG fallback.');
    }
  }

  function handleVideoReady(event: React.SyntheticEvent<HTMLVideoElement>) {
    event.currentTarget.play().catch(() => undefined);
    setMessage('Connected');
    setStatus({ ok: true, message: 'Connected' });
  }

  function applyWebRtcAudioSettings() {
    const settings = { muted: audioMuted || audioVolume === 0, volume: clamp(audioVolume / 100, 0, 1) };
    applyIframeVideoAudio(settings);
    void window.fjoscam.setStreamAudio(settings.muted, settings.volume);
  }

  function applyIframeVideoAudio(settings: { muted: boolean; volume: number }): boolean {
    const frame = webRtcFrameRef.current;
    const video = frame?.contentDocument?.querySelector('video');
    if (!video) return false;
    video.muted = settings.muted;
    video.volume = settings.volume;
    return true;
  }

  function scheduleIframeAudioApply(attempts: number) {
    if (audioApplyTimerRef.current !== null) window.clearTimeout(audioApplyTimerRef.current);
    const apply = (remaining: number) => {
      if (applyIframeVideoAudio({ muted: audioMuted || audioVolume === 0, volume: clamp(audioVolume / 100, 0, 1) }) || remaining <= 0) return;
      audioApplyTimerRef.current = window.setTimeout(() => apply(remaining - 1), 250);
    };
    apply(attempts);
  }

  function setVolume(value: number) {
    const nextVolume = clamp(value, 0, 100);
    setAudioVolume(nextVolume);
    if (nextVolume > 0 && audioMuted) setAudioMuted(false);
  }

  function handleImageReady() {
    setMessage('Connected');
    setStatus({ ok: true, message: 'Connected' });
    scheduleIframeAudioApply(8);
  }

  function clearCurrentStream() {
    runtimeLoadRef.current += 1;
    setSnapshotUrl('');
  }

  function getStageBounds() {
    if (!stageRef.current) return null;
    const bounds = stageRef.current.getBoundingClientRect();
    return {
      x: bounds.left,
      y: bounds.top,
      width: bounds.width,
      height: bounds.height,
    };
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
          <div className={`ptz-panel collapsible-panel ${ptzExpanded ? 'expanded' : ''}`}>
            <button className="panel-toggle" onClick={() => setPtzExpanded((value) => !value)}>
              <span>PTZ</span>
              <small>{ptzExpanded ? 'Hide' : `Speed ${speed}`}</small>
            </button>

            {ptzExpanded && (
              <div className="panel-body">
                <div className="ptz-grid">
                  {directions.map(({ direction, Icon, className }) => (
                    <button
                      key={direction}
                      className={`ptz-button ${className}`}
                      title={direction}
                      disabled={!activeCamera}
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
                  <input min="1" max="64" value={speed} type="range" onChange={(event) => setSpeed(Number(event.target.value))} />
                </label>

                {activeCamera && isReolinkCamera && (
                  <label className="slider-label zoom-position-control">
                    <span>Optical zoom</span>
                    <strong>{zoomPositionLabel(opticalZoomPosition)}</strong>
                    <input
                      min="0"
                      max="34"
                      step="1"
                      value={opticalZoomPosition}
                      type="range"
                      onChange={(event) => setOpticalZoomPosition(clamp(Number(event.target.value), 0, 34))}
                      onMouseUp={(event) => void setOpticalZoomPositionValue(Number(event.currentTarget.value))}
                      onTouchEnd={(event) => void setOpticalZoomPositionValue(Number(event.currentTarget.value))}
                      onKeyUp={(event) => void setOpticalZoomPositionValue(Number(event.currentTarget.value))}
                    />
                  </label>
                )}

                <div className="quick-row">
                  <button disabled={!activeCamera} onClick={() => void zoomStep('out')} title="Zoom out">
                    <ZoomOut size={18} />
                  </button>
                  <button disabled={!activeCamera} onClick={() => void zoomStep('in')} title="Zoom in">
                    <ZoomIn size={18} />
                  </button>
                  <button disabled={!activeCamera} onClick={() => void testCamera()} title="Refresh presets">
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
                    type="range"
                    onChange={(event) => changeFocus(Number(event.target.value))}
                    onMouseUp={stopFocus}
                    onTouchEnd={stopFocus}
                    onKeyUp={stopFocus}
                  />
                </label>
                <div className="quick-row">
                  <button disabled={!activeCamera} onClick={() => void send({ kind: 'focus', direction: 'near', speed: focusSpeed })} title="Focus near">
                    <Focus size={18} />
                  </button>
                  <button disabled={!activeCamera} onClick={() => void send({ kind: 'focus', direction: 'far', speed: focusSpeed })} title="Focus far">
                    <Eye size={18} />
                  </button>
                  <button disabled={!activeCamera || !isReolinkCamera || busy} onClick={openPresetDialog} title="Save current PTZ preset">
                    Save preset
                  </button>
                </div>
              </div>
            )}
          </div>

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

            {profile.capabilities.irLights && (
              <label className="control-row">
                <span>IR</span>
                <select value={irMode ?? 'auto'} onChange={(event) => void changeIrMode(event.target.value as IrLightMode)}>
                  <option value="auto">Auto</option>
                  <option value="on">On</option>
                  <option value="off">Off</option>
                </select>
              </label>
            )}

            {whiteLed && (
              <div className="light-controls">
                <div className="segmented-control">
                  <button className={whiteLed.enabled ? 'selected' : ''} onClick={() => void setCameraLight(true)}>
                    Light on
                  </button>
                  <button className={!whiteLed.enabled ? 'selected' : ''} onClick={() => void setCameraLight(false)}>
                    Off
                  </button>
                </div>
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
                <small className="control-hint">Some cameras require an admin user to change the light.</small>
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
                onLoad={handleImageReady}
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
                  onLoad={handleImageReady}
                  onError={handleStreamError}
                />
              </>
            ) : (
              <div className="stream-placeholder">
                <Camera size={56} />
                <strong>{isStreamEnabled ? 'WebRTC bridge running' : 'Stream disconnected'}</strong>
                <span>{isStreamEnabled ? 'Connecting to low-latency WebRTC.' : 'Press Connect to start live view.'}</span>
                <small>Hold mouse button in the picture to move PTZ. Use zoom buttons or mouse wheel for digital zoom.</small>
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
                <button className="preset-recall" disabled={!activeCamera} onClick={() => void send({ kind: 'preset', presetId: preset.id })}>
                  {preset.name}
                </button>
                {cameraEditMode && isReolinkCamera && (
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
          <div className="stream-detail">{streamDetail}</div>
          <div className={`status ${message === 'Connected' || status?.ok ? 'ok' : status ? 'bad' : ''}`}>
            {message || status?.message || (activeCamera ? (isStreamEnabled ? 'Connecting...' : 'Disconnected') : 'No camera')}
          </div>
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
        <div className="modal-backdrop" onMouseDown={() => setShowAbout(false)}>
          <div className="small-modal" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-heading">
              <h2>About Fjoscam</h2>
              <button type="button" className="icon-button" onClick={() => setShowAbout(false)}>
                ×
              </button>
            </div>
            <p>Fjoscam {appVersion || '1.0.0'}</p>
            <p className="muted-text">Low-latency Reolink LAN viewer.</p>
            <div className="modal-actions">
              <button type="button" onClick={() => void checkForUpdates()}>Check for updates</button>
            </div>
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
                  href="https://www.paypal.com/donate/?business=VSSTWS8ETDPXW&no_recurring=0&item_name=Support+my+software+projects+%E2%80%94+every+contribution+helps.+Thank+you%21&currency_code=USD"
                  target="_blank"
                  rel="noreferrer"
                >
                  Donate with PayPal
                </a>
              </div>
            </section>
          </div>
        </div>
      )}

      {showPresetDialog && (
        <div className="modal-backdrop" onMouseDown={() => setShowPresetDialog(false)}>
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
              <button type="button" className="icon-button" onClick={() => setShowPresetDialog(false)}>
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
        </div>
      )}

      {showUpdateDialog && updateStatus && (
        <div className="modal-backdrop" onMouseDown={() => setShowUpdateDialog(false)}>
          <div className="small-modal" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-heading">
              <h2>Fjoscam update</h2>
              <button type="button" className="icon-button" onClick={() => setShowUpdateDialog(false)}>
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
        </div>
      )}

      {showSettings && (
        <div className="modal-backdrop" onMouseDown={() => setShowSettings(false)}>
          <form className="settings-modal" onMouseDown={(event) => event.stopPropagation()} onSubmit={(event) => void saveCamera(event)}>
            <div className="modal-heading">
              <h2>{editingId ? 'Edit camera' : 'Add camera'}</h2>
              <button type="button" className="icon-button" onClick={() => setShowSettings(false)}>
                ×
              </button>
            </div>
            {!editingId && (
              <section className="discovery-panel">
                <div className="discovery-heading">
                  <div>
                    <strong>Found cameras</strong>
                    <span>{discoveryMessage || 'Search for ONVIF and RTSP cameras on this network.'}</span>
                  </div>
                  <button type="button" onClick={() => void scanForCameras()} disabled={discoveryBusy}>
                    {discoveryBusy ? 'Searching...' : 'Search again'}
                  </button>
                </div>
                {discoveredCameras.length > 0 && (
                  <div className="discovery-list">
                    {discoveredCameras.map((camera) => {
                      const alreadyAdded = existingCameraHosts.has(camera.host);
                      return (
                        <button type="button" key={camera.id} className={`discovery-item ${alreadyAdded ? 'already-added' : ''}`} onClick={() => useDiscoveredCamera(camera)}>
                          <span className="discovery-main">
                            {alreadyAdded && <CheckCircle2 className="discovery-check" size={18} aria-label="Already added" />}
                            <span>
                              <strong>{discoveryDisplayName(camera)}</strong>
                              <small>{camera.host} · {camera.source === 'ws-discovery' ? 'ONVIF discovery' : 'Port scan'}</small>
                            </span>
                          </span>
                          <small>{discoveryPorts(camera)}</small>
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>
            )}
            <div className="form-grid">
              <label>Camera type<select value={form.kind} onChange={(event) => setCameraKind(event.target.value as CameraInput['kind'])}><option value="reolink">Reolink LAN camera</option><option value="panasonic">Panasonic legacy MJPEG</option><option value="generic">Generic RTSP/RTSPS stream</option></select></label>
              <label>Name<span className="input-action"><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /><button type="button" onClick={() => void fetchCameraName()} disabled={busy}>Fetch</button></span></label>
              <label>IP / host<input value={form.host} onChange={(event) => setForm({ ...form, host: event.target.value })} /></label>
              <label>Protocol<select value={form.protocol} onChange={(event) => setForm({ ...form, protocol: event.target.value as 'http' | 'https' })}><option>http</option><option>https</option></select></label>
              <label>HTTP port<input type="number" value={form.httpPort} onChange={(event) => setForm({ ...form, httpPort: Number(event.target.value) })} /></label>
              {form.kind === 'generic' ? (
                <label className="wide-field">Stream URL<input value={form.streamUrl ?? ''} placeholder="rtsps://10.0.0.1:7441/..." onChange={(event) => setForm({ ...form, streamUrl: event.target.value, host: inferHostFromStreamUrl(event.target.value) || form.host })} /></label>
              ) : form.kind === 'reolink' ? (
                <>
                  <label>RTSP port<input type="number" value={form.rtspPort} onChange={(event) => setForm({ ...form, rtspPort: Number(event.target.value) })} /></label>
                  <label>Control channel<input type="number" min="0" value={form.channel} onChange={(event) => setForm({ ...form, channel: Number(event.target.value) })} /></label>
                  <label>View channel<select value={form.streamChannel} onChange={(event) => setForm({ ...form, streamChannel: Number(event.target.value) })}><option value={0}>0 - Wide/main</option><option value={1}>1 - Zoom/second</option></select></label>
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
            {form.kind === 'reolink' && (
              <label className="check-row wide-field">
                <input type="checkbox" checked={form.lowLatency} onChange={(event) => setForm({ ...form, lowLatency: event.target.checked })} />
                Start this camera on Low/Fluent
              </label>
            )}
            <div className="modal-actions">
              {activeCamera && <button type="button" onClick={() => editCamera(activeCamera)}>Edit active</button>}
              <button type="submit" disabled={busy}>{busy ? 'Saving...' : 'Save camera'}</button>
            </div>
            {message && <p className="form-message">{message}</p>}
          </form>
        </div>
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
    case 'error':
      return status.message;
  }
}

function discoveryDisplayName(camera: CameraDiscoveryResult): string {
  return camera.name || [camera.manufacturer, camera.model].filter(Boolean).join(' ') || `Camera ${camera.host}`;
}

function discoveryPorts(camera: CameraDiscoveryResult): string {
  const parts = [
    camera.ports.http ? `HTTP ${camera.ports.http}` : '',
    camera.ports.https ? `HTTPS ${camera.ports.https}` : '',
    camera.ports.rtsp ? `RTSP ${camera.ports.rtsp}` : '',
    camera.ports.onvif ? `ONVIF ${camera.ports.onvif}` : '',
  ].filter(Boolean);
  return parts.join(' · ');
}

function cameraSubtitle(camera: CameraConfig, hasSecondaryLens: boolean): string {
  if (camera.kind === 'generic') return 'Generic RTSP/RTSPS stream';
  if (camera.kind === 'panasonic') return 'Panasonic MJPEG';
  return `${hasSecondaryLens ? ((camera.streamChannel ?? 0) === 1 ? 'Zoom lens' : 'Wide lens') : 'Camera'} · ${camera.lowLatency ? 'Low/Fluent' : 'High/Clear'}`;
}

function zoomPositionLabel(position: number): string {
  return `${Math.round(clamp(position, 0, 34))}/34`;
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

function presetIndexFromKey(code: string): number | null {
  if (/^Digit[1-9]$/.test(code)) return Number(code.slice(5)) - 1;
  if (code === 'Digit0') return 9;
  return null;
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

function supportsSecondaryLens(camera: CameraConfig): boolean {
  if ((camera.streamChannel ?? 0) > 0) return true;
  return /trackmix|dual|rv heima/i.test(camera.name);
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
