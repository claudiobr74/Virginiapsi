"use client";

import { Camera, ImagePlus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal, ModalContent } from "@/components/ui/modal";
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
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [cleared, setCleared] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    if (!cameraOpen) {
      return;
    }
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "user" }, audio: false })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      })
      .catch(() => {
        setCameraError(
          "Não foi possível acessar a câmera. Você pode enviar um arquivo.",
        );
      });

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [cameraOpen]);

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

  function captureFrame() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) {
      setCameraError("Aguarde a câmera carregar e tente de novo.");
      return;
    }
    const side = Math.min(video.videoWidth, video.videoHeight);
    const sx = (video.videoWidth - side) / 2;
    const sy = (video.videoHeight - side) / 2;
    const canvas = document.createElement("canvas");
    canvas.width = 720;
    canvas.height = 720;
    const context = canvas.getContext("2d");
    if (!context) {
      setCameraError("Não foi possível capturar o quadro.");
      return;
    }
    context.drawImage(video, sx, sy, side, side, 0, 0, 720, 720);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setCameraError("Não foi possível capturar o quadro.");
          return;
        }
        applyFile(new File([blob], "retrato.jpg", { type: "image/jpeg" }));
        setCameraOpen(false);
      },
      "image/jpeg",
      0.86,
    );
  }

  const displayUrl = cleared ? null : previewUrl ?? currentPhotoUrl ?? null;

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
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
          >
            <ImagePlus className="size-4" aria-hidden />
            Enviar foto
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              setCameraError(null);
              setCameraOpen(true);
            }}
          >
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

      <Modal open={cameraOpen} onOpenChange={setCameraOpen}>
        <ModalContent
          title="Tirar foto"
          description="Posicione o rosto no quadro e capture."
          size="sm"
          footer={
            <>
              <Button type="button" variant="secondary" onClick={() => setCameraOpen(false)}>
                Cancelar
              </Button>
              <Button type="button" onClick={captureFrame} disabled={Boolean(cameraError)}>
                Capturar
              </Button>
            </>
          }
        >
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
        </ModalContent>
      </Modal>
    </div>
  );
}
