import { createFileRoute } from "@tanstack/react-router";
import { Download } from "~/components/Download";
import { Features } from "~/components/Features";
import { Footer } from "~/components/Footer";
import { Hero } from "~/components/Hero";
import { Providers } from "~/components/Providers";
import { SiteHeader } from "~/components/SiteHeader";
import { Spotlight } from "~/components/Spotlight";

export const Route = createFileRoute("/")({
  component: LandingPage,
});

function LandingPage() {
  return (
    <>
      <SiteHeader />
      <main>
        <Hero />
        <Providers />
        <Features />
        <Spotlight />
        <Download />
      </main>
      <Footer />
    </>
  );
}
