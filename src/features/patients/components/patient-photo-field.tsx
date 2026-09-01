"use client";

import { Camera, ImagePlus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal, ModalContent } from "@/components/ui/modal";
import {
  cameraErrorMessage,
  captureSquareJpeg,
  isCameraApiAvailable,
  isVideoFrameReady,
  playCameraVideo,
  requestCameraStream,
  stopMediaStream,
  waitForVideoReady,
  type CameraUiState,
} from "@/features/patients/camera-capture";
import { PatientAvatar } from "@/features/patients/components/patient-avatar";
import {
  PORTRAIT_MAX_BYTES,
  isPortraitMimeType,
} from "@/features/patients/portrait";

export function PatientPhotoField({
  name,
  currentPhotoUrl,
  onFileChange,
}: {
  name: string;
  currentPhotoUrl?: string | null;
  onFileChange: (file: File | null) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nativeCaptureRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [cleared, setCleared] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraState, setCameraState] = useState<CameraUiState>("idle");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [videoReady, setVideoReady] = useState(false);
  const [streamNonce, setStreamNonce] = useState(0);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    return () => {
      stopMediaStream(streamRef.current);
      streamRef.current = null;
    };
  }, []);

  function stopTracks() {
    stopMediaStream(streamRef.current);
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setVideoReady(false);
  }

  function closeCamera() {
    stopTracks();
    setCameraOpen(false);
    setCameraError(null);
    setCameraState("idle");
  }

  function applyFile(file: File) {
    if (!isPortraitMimeType(file.type)) {
      setFieldError("Use uma imagem JPEG, PNG ou WebP.");
      return;
    }
    if (file.size > PORTRAIT_MAX_BYTES) {
      setFieldError("A foto deve ter no máximo 5 MB.");
      return;
    }
    setFieldError(null);
    setCleared(false);
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return URL.createObjectURL(file);
    });
    onFileChange(file);
  }

  useEffect(() => {
    if (!cameraOpen || streamNonce === 0) {
      return;
    }
    let cancelled = false;
    let raf = 0;

    const tryAttach = () => {
      const video = videoRef.current;
      const stream = streamRef.current;
      if (cancelled) {
        return;
      }
      if (!video || !stream) {
        raf = window.requestAnimationFrame(tryAttach);
        return;
      }
      void playCameraVideo(video, stream)
        .then(() => waitForVideoReady(video))
        .then(() => {
          if (cancelled || !isVideoFrameReady(video)) {
            return;
          }
          setVideoReady(true);
          setCameraState("streaming");
        })
        .catch((error) => {
          if (cancelled) {
            return;
          }
          stopMediaStream(streamRef.current);
          streamRef.current = null;
          if (videoRef.current) {
            videoRef.current.srcObject = null;
          }
          setVideoReady(false);
          setCameraError(cameraErrorMessage(error));
          setCameraState("error");
        });
    };

    tryAttach();
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(raf);
    };
  }, [cameraOpen, streamNonce]);

  async function openGetUserMediaCamera() {
    setCameraError(null);
    setVideoReady(false);
    setCameraState("requesting_permission");
    setCameraOpen(true);
    const streamPromise = requestCameraStream();
    try {
      const stream = await streamPromise;
      streamRef.current = stream;
      setStreamNonce((value) => value + 1);
    } catch (error) {
      setCameraError(cameraErrorMessage(error));
      setCameraState("error");
    }
  }

  async function onTakePhoto() {
    if (!isCameraApiAvailable()) {
      nativeCaptureRef.current?.click();
      return;
    }
    await openGetUserMediaCamera();
  }

  async function captureFrame() {
    const video = videoRef.current;
    if (!video || !isVideoFrameReady(video)) {
      setCameraError("Aguarde a câmera carregar e tente de novo.");
      return;
    }
    setCameraState("capturing");
    try {
      const blob = await captureSquareJpeg(video);
      applyFile(new File([blob], "retrato.jpg", { type: "image/jpeg" }));
      closeCamera();
    } catch (error) {
      const name = error instanceof Error ? error.message : "";
      if (name === "BlobNull") {
        setCameraError("Não foi possível capturar o quadro. Tente de novo.");
      } else if (name === "VideoNotReady") {
        setCameraError("Aguarde a câmera carregar e tente de novo.");
      } else {
        setCameraError(cameraErrorMessage(error));
      }
      setCameraState("error");
    }
  }

  const displayUrl = cleared ? null : previewUrl ?? currentPhotoUrl ?? null;
  const captureDisabled =
    cameraState === "requesting_permission" ||
    cameraState === "capturing" ||
    cameraState === "error" ||
    !videoReady;

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <PatientAvatar name={name || "Paciente"} photoUrl={displayUrl} size="lg" />
      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold text-foreground">Foto de identificação</p>
        <p className="text-xs text-muted-foreground">
          Opcional. JPEG, PNG ou WebP até 5 MB — envie um arquivo ou use a câmera.
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) applyFile(file);
              event.target.value = "";
            }}
          />
          <input
            ref={nativeCaptureRef}
            type="file"
            accept="image/*"
            capture="user"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) applyFile(file);
              event.target.value = "";
            }}
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
          >
            <ImagePlus className="size-4" aria-hidden />
            Enviar foto
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={() => void onTakePhoto()}>
            <Camera className="size-4" aria-hidden />
            Tirar foto
          </Button>
          {displayUrl ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setCleared(true);
                setPreviewUrl((current) => {
                  if (current) URL.revokeObjectURL(current);
                  return null;
                });
                onFileChange(null);
                setFieldError(null);
              }}
            >
              <Trash2 className="size-4" aria-hidden />
              Remover
            </Button>
          ) : null}
        </div>
        {fieldError ? <p className="text-xs text-failed">{fieldError}</p> : null}
      </div>

      <Modal
        open={cameraOpen}
        onOpenChange={(open) => {
          if (!open) closeCamera();
        }}
      >
        <ModalContent
          title="Tirar foto"
          description="Posicione o rosto no quadro e capture."
          size="sm"
          footer={
            <>
              <Button type="button" variant="secondary" onClick={closeCamera}>
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={() => void captureFrame()}
                disabled={captureDisabled}
              >
                Capturar
              </Button>
            </>
          }
        >
          {cameraState === "requesting_permission" ? (
            <p className="text-sm text-muted-foreground">Abrindo câmera...</p>
          ) : null}
          {cameraError ? (
            <p role="alert" className="text-sm text-failed">
              {cameraError}
            </p>
          ) : (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="aspect-square w-full rounded-2xl bg-deep-neutral object-cover"
            />
          )}
          {cameraState === "streaming" && !videoReady && !cameraError ? (
            <p className="mt-2 text-sm text-muted-foreground">Abrindo câmera...</p>
          ) : null}
        </ModalContent>
      </Modal>
    </div>
  );
}
