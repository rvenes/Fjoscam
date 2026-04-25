import { FormEvent, MouseEvent, WheelEvent, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowDown, ArrowDownLeft, ArrowDownRight, ArrowLeft, ArrowRight, ArrowUp, ArrowUpLeft, ArrowUpRight, Camera, Crosshair, Eye, Focus, HelpCircle, Loader2, Pause, Play, Plus, Radio, RotateCcw, Settings, Trash2, WifiOff, ZoomIn, ZoomOut } from 'lucide-react';
import type { AppState, CameraConfig, CameraInput, ConnectionStatus, Preset, PtzCommand, PtzDirection, StreamInfo } from '../shared/types';
import { clickToPtzCommand } from '../shared/ptz';
import './styles.css';

const defaultInput: CameraInput = {
  name: '',
  host: '',
  protocol: 'http',
  httpPort: 80,
  rtspPort: 554,
  username: 'admin',
  password: '',
  channel: 0,
  streamChannel: 0,
  lowLatency: true,
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
  const [showTips, setShowTips] = useState(false);
  const [speed, setSpeed] = useState(30);
  const [focusSpeed, setFocusSpeed] = useState(20);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [streamInfo, setStreamInfo] = useState<{ high?: StreamInfo; low?: StreamInfo }>({});
  const [snapshotUrl, setSnapshotUrl] = useState('');
  const [fallbackUrl, setFallbackUrl] = useState('');
  const [isStreamEnabled, setIsStreamEnabled] = useState(true);
  const [streamRevision, setStreamRevision] = useState(0);
  const [digitalZoom, setDigitalZoom] = useState(1);
  const [opticalZoomLevel, setOpticalZoomLevel] = useState<1 | 2 | 3 | 4>(1);
  const [digitalPan, setDigitalPan] = useState({ x: 0, y: 0 });
  const [digitalOrigin, setDigitalOrigin] = useState({ x: 50, y: 50 });
  const stageRef = useRef<HTMLDivElement | null>(null);
  const mediaRef = useRef<HTMLImageElement | HTMLVideoElement | null>(null);
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
  const hasSecondaryLens = activeCamera ? supportsSecondaryLens(activeCamera) : false;

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (isEditableTarget(event.target) || !activeCamera) return;
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

      if (event.code === 'NumpadEnter' || event.code === 'Enter') {
        event.preventDefault();
        if (!event.repeat && hasSecondaryLens) void toggleZoomChannel();
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
  }, [activeCamera, hasSecondaryLens, speed]);

  useEffect(() => {
    if (!activeCamera) {
      setPresets([]);
      setStreamInfo({});
      setSnapshotUrl('');
      setFallbackUrl('');
      setStatus(null);
      setMessage('');
      return;
    }
    if (!isStreamEnabled) {
      clearCurrentStream();
      setMessage('Disconnected');
      setStatus(null);
      return;
    }
    void loadWebRtcRuntime(activeCamera.id);
  }, [activeCamera?.id, activeCamera?.streamChannel, activeCamera?.lowLatency, isStreamEnabled]);

  async function refresh() {
    setState(await window.fjoscam.getState());
  }

  async function loadWebRtcRuntime(id: string) {
    const loadId = runtimeLoadRef.current + 1;
    runtimeLoadRef.current = loadId;
    setMessage('Starting WebRTC live...');
    setStatus(null);
    try {
      setFallbackUrl('');
      setSnapshotUrl('');
      const webRtcStream = await window.fjoscam.getWebRtcStream(id);
      if (runtimeLoadRef.current !== loadId) return;
      setSnapshotUrl(webRtcStream.pageUrl);
      setStreamRevision((value) => value + 1);
      setMessage('WebRTC live');
      setStatus({ ok: true, message: 'WebRTC live' });

      const [nextPresets, nextFallbackUrl, nextStreamInfo] = await Promise.all([
        window.fjoscam.getPresets(id).catch(() => []),
        window.fjoscam.getMjpegUrl(id).catch(() => ''),
        window.fjoscam.getStreamInfo(id).catch(() => ({})),
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
    setState(await window.fjoscam.removeCamera(id));
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

  function editCamera(camera: CameraConfig) {
    setForm({
      ...camera,
      streamChannel: camera.streamChannel ?? camera.channel,
      password: '',
    });
    setEditingId(camera.id);
    setShowSettings(true);
  }

  async function send(command: PtzCommand) {
    if (!activeCamera) return;
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
      ? `WebRTC live${formatStreamInfo(activeStreamInfo)}${digitalZoom > 1 ? ` · Digital zoom ${digitalZoom.toFixed(1)}x` : ''}`
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

  function handleImageReady() {
    setMessage('Connected');
    setStatus({ ok: true, message: 'Connected' });
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
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">
          <Radio size={26} />
          <span>Fjoscam</span>
        </div>

        <div className="section-title">
          <span>Kamera</span>
          <button className="icon-button" title="Add camera" onClick={() => setShowSettings(true)}>
            <Plus size={18} />
          </button>
        </div>

        <div className="camera-list">
          {state.cameras.map((camera) => (
            <button
              className={`camera-item ${camera.id === state.activeCameraId ? 'active' : ''}`}
              key={camera.id}
              onClick={() => void selectCamera(camera.id)}
            >
              <span className="camera-name">{camera.name}</span>
              <span className="camera-host">{camera.host}</span>
            </button>
          ))}
          {state.cameras.length === 0 && <p className="empty">Legg til eit Reolink-kamera på LAN.</p>}
        </div>

        <div className="ptz-panel">
          <div className="panel-heading">
            <span>PTZ</span>
            <small>{activeCamera?.name ?? 'Ingen kamera'}</small>
          </div>

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
      </aside>

      <section className="viewer">
        <header className="topbar">
          <div>
            <h1>{activeCamera?.name ?? 'Live View'}</h1>
            <p>{activeCamera ? `${hasSecondaryLens ? ((activeCamera.streamChannel ?? 0) === 1 ? 'Zoom lens' : 'Wide lens') : 'Camera'} · ${activeCamera.lowLatency ? 'Low/Fluent' : 'High/Clear'}` : 'Add a camera to begin'}</p>
          </div>
          <div className="top-actions">
            {activeCamera && hasSecondaryLens && (
              <div className="channel-switch" aria-label="View channel">
                <button className={(activeCamera.streamChannel ?? 0) === 0 ? 'selected' : ''} onClick={() => void setViewChannel(0)}>Wide</button>
                <button className={(activeCamera.streamChannel ?? 0) === 1 ? 'selected' : ''} onClick={() => void setViewChannel(1)}>Zoom</button>
              </div>
            )}
            {activeCamera && (
              <div className="channel-switch quality-switch" aria-label="Stream quality">
                <button className={!activeCamera.lowLatency ? 'selected' : ''} onClick={() => void setStreamQuality(false)}>High</button>
                <button className={activeCamera.lowLatency ? 'selected' : ''} onClick={() => void setStreamQuality(true)}>Low</button>
              </div>
            )}
            {activeCamera && (
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
            <button onClick={() => setShowTips((value) => !value)}>
              <HelpCircle size={18} />
              Tips
            </button>
            <button onClick={() => setShowSettings(true)}>
              <Settings size={18} />
              Settings
            </button>
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
                className="snapshot webrtc-frame"
                src={streamSrc()}
                title={`${activeCamera.name} WebRTC live view`}
                allow="autoplay; fullscreen; picture-in-picture"
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
          <strong>Tips</strong>
          <span>1x, 2x, 3x og 4x styrer optisk zoom når kameraet støttar det.</span>
          <span>Hald museknappen inne i bildet for å flytte kameraet.</span>
          <span>Numpad + og - justerer PT-farten.</span>
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
            <div className="form-grid">
              <label>Name<span className="input-action"><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /><button type="button" onClick={() => void fetchCameraName()} disabled={busy}>Fetch</button></span></label>
              <label>IP / host<input value={form.host} onChange={(event) => setForm({ ...form, host: event.target.value })} /></label>
              <label>Protocol<select value={form.protocol} onChange={(event) => setForm({ ...form, protocol: event.target.value as 'http' | 'https' })}><option>http</option><option>https</option></select></label>
              <label>HTTP port<input type="number" value={form.httpPort} onChange={(event) => setForm({ ...form, httpPort: Number(event.target.value) })} /></label>
              <label>RTSP port<input type="number" value={form.rtspPort} onChange={(event) => setForm({ ...form, rtspPort: Number(event.target.value) })} /></label>
              <label>Control channel<input type="number" min="0" value={form.channel} onChange={(event) => setForm({ ...form, channel: Number(event.target.value) })} /></label>
              <label>View channel<select value={form.streamChannel} onChange={(event) => setForm({ ...form, streamChannel: Number(event.target.value) })}><option value={0}>0 - Wide/main</option><option value={1}>1 - Zoom/second</option></select></label>
              <label>Username<input value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} /></label>
              <label>Password<input type="password" value={form.password} placeholder={editingId ? 'Enter to replace saved password' : ''} onChange={(event) => setForm({ ...form, password: event.target.value })} /></label>
            </div>
            <label className="check-row">
              <input type="checkbox" checked={form.lowLatency} onChange={(event) => setForm({ ...form, lowLatency: event.target.checked })} />
              Prefer substream for lower latency
            </label>
            <div className="modal-actions">
              {editingId && <button type="button" className="danger" onClick={() => void removeCamera(editingId)}><Trash2 size={18} /> Remove</button>}
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
      return 'Up';
    case 'Numpad9':
      return 'RightUp';
    case 'Numpad4':
      return 'Left';
    case 'Numpad6':
      return 'Right';
    case 'Numpad1':
      return 'LeftDown';
    case 'Numpad2':
      return 'Down';
    case 'Numpad3':
      return 'RightDown';
    default:
      return null;
  }
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
