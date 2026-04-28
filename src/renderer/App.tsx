import { FormEvent, MouseEvent, WheelEvent, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowDown, ArrowDownLeft, ArrowDownRight, ArrowLeft, ArrowRight, ArrowUp, ArrowUpLeft, ArrowUpRight, Camera, Crosshair, Eye, Focus, Loader2, Pause, Play, Plus, Radio, RotateCcw, Trash2, Volume2, VolumeX, WifiOff, ZoomIn, ZoomOut } from 'lucide-react';
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
  const [opticalZoomLevel, setOpticalZoomLevel] = useState<1 | 2 | 3 | 4>(1);
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
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const activeCamera = useMemo(
    () => state.cameras.find((camera) => camera.id === state.activeCameraId) ?? null,
    [state],
  );
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
  }, [activeCamera, presets, speed, state.cameras, viewerFullscreen]);

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
      username: isPanasonic ? 'codexc' : form.username,
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
            username: form.username === 'admin' ? 'codexc' : form.username,
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

  async function setOpticalZoom(level: 1 | 2 | 3 | 4) {
    setOpticalZoomLevel(level);
    await send({ kind: 'zoomLevel', level });
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
    const frame = webRtcFrameRef.current;
    frame?.contentWindow?.postMessage({ type: 'fjoscam-audio', muted: audioMuted || audioVolume === 0, volume: clamp(audioVolume / 100, 0, 1) }, '*');
  }

  function setVolume(value: number) {
    const nextVolume = clamp(value, 0, 100);
    setAudioVolume(nextVolume);
    if (nextVolume > 0 && audioMuted) setAudioMuted(false);
  }

  function handleImageReady() {
    setMessage('Connected');
    setStatus({ ok: true, message: 'Connected' });
    applyWebRtcAudioSettings();
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
            {activeCamera && isReolinkCamera && (
              <div className="channel-switch zoom-switch" aria-label="Optical zoom">
                {([1, 2, 3, 4] as const).map((zoom) => (
                  <button key={zoom} className={opticalZoomLevel === zoom ? 'selected' : ''} onClick={() => void setOpticalZoom(zoom)}>
                    {zoom}x
                  </button>
                ))}
              </div>
            )}
            <button onClick={() => void toggleStream()} disabled={!activeCamera || busy}>
              {busy ? <Loader2 className="spin" size={18} /> : isStreamEnabled ? <Pause size={18} /> : <Play size={18} />}
              {isStreamEnabled ? 'Disconnect' : 'Connect'}
            </button>
            <button className="selected-action" disabled={!activeCamera}>
              WebRTC
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
              <button key={preset.id} disabled={!activeCamera} onClick={() => void send({ kind: 'preset', presetId: preset.id })}>
                {preset.name}
              </button>
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
        <div className="tips-popover">
          <strong>Hjelp</strong>
          <span><kbd>Enter</kbd> fullskjerm av/på.</span>
          <span><kbd>Page Up</kbd> neste kamera. <kbd>Page Down</kbd> førre kamera.</span>
          <span><kbd>←</kbd> <kbd>↑</kbd> <kbd>↓</kbd> <kbd>→</kbd>, <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> eller numpad styrer kamera.</span>
          <span><kbd>1</kbd>-<kbd>9</kbd> går til lagra PTZ-posisjon 1-9. <kbd>0</kbd> går til posisjon 10.</span>
          <span><kbd>+</kbd> og <kbd>-</kbd> justerer PT-farten.</span>
          <span>1x, 2x, 3x og 4x styrer optisk zoom når kameraet støttar det.</span>
          <button onClick={() => void checkForUpdates()}>Check for updates</button>
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
                    {discoveredCameras.map((camera) => (
                      <button type="button" key={camera.id} className="discovery-item" onClick={() => useDiscoveredCamera(camera)}>
                        <span>
                          <strong>{discoveryDisplayName(camera)}</strong>
                          <small>{camera.host} · {camera.source === 'ws-discovery' ? 'ONVIF discovery' : 'Port scan'}</small>
                        </span>
                        <small>{discoveryPorts(camera)}</small>
                      </button>
                    ))}
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
              <label className="check-row">
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
