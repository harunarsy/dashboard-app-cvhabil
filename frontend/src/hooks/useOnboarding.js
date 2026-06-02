import { useCallback, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "habil_onboarded_v1";

export default function useOnboarding(enabled = true) {
  const [stepIndex, setStepIndex] = useState(0);
  const [active, setActive] = useState(false);

  const steps = useMemo(
    () => [
      {
        selector: "[data-onboarding='sidebar']",
        title: "Selamat datang di HABIL SUPERAPP",
        body: "Navigasi utama ada di sini. Semua modul operasional bisa diakses dari satu panel.",
      },
      {
        selector: "[data-onboarding='tasks']",
        title: "Pantau kerja harian",
        body: "Kanban tugas membantu tim melihat pekerjaan yang perlu diselesaikan hari ini.",
      },
      {
        selector: "[data-onboarding='kpi']",
        title: "Angka penting tetap dekat",
        body: "Kartu ringkas menampilkan sinyal bisnis yang paling sering dipantau.",
      },
      {
        selector: "[data-onboarding='quick-actions']",
        title: "Aksi cepat",
        body: "Gunakan tombol aksi untuk langsung membuat nota, SP, atau masuk ke inventory.",
      },
      {
        selector: "[data-onboarding='feedback']",
        title: "Kirim masukan kapan saja",
        body: "Bug dan saran fitur bisa dikirim dari tombol ini agar tim cepat menindaklanjuti.",
      },
    ],
    [],
  );

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    if (window.localStorage.getItem(STORAGE_KEY) === "true") return;
    const timer = window.setTimeout(() => setActive(true), 900);
    return () => window.clearTimeout(timer);
  }, [enabled]);

  const finish = useCallback(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, "true");
    }
    setActive(false);
  }, []);

  const next = useCallback(() => {
    setStepIndex((current) => {
      if (current >= steps.length - 1) {
        finish();
        return current;
      }
      return current + 1;
    });
  }, [finish, steps.length]);

  return {
    active,
    currentStep: steps[stepIndex],
    stepIndex,
    steps,
    next,
    skip: finish,
  };
}
