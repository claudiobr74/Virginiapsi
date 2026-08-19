import Image from "next/image";

const LOGO_SRC = "/brand/Logo SerenaPsi em Gradiente Sereno(2).png";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-16">
      <Image
        src={LOGO_SRC}
        alt="SerenaPsi"
        width={1536}
        height={1024}
        priority
        className="h-auto w-full max-w-xs"
      />
      <h1 className="text-2xl font-semibold tracking-tight">SerenaPsi</h1>
      <p className="max-w-md text-center text-sm leading-6 opacity-80">
        Fundação técnica da aplicação. A identidade visual completa e os módulos
        do produto começam na Fase 1.
      </p>
    </main>
  );
}
