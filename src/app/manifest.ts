import type { MetadataRoute } from "next";

/** Lets Big SMS be installed as an app, with the LGITE crest as its icon. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LGITE · Big SMS",
    short_name: "LGITE",
    description: "Lahore Garrison Institute of Technical Education: school management system.",
    start_url: "/",
    display: "standalone",
    background_color: "#F5F8FB",
    theme_color: "#002A64",
    icons: [
      { src: "/icon.png", sizes: "64x64", type: "image/png" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
      { src: "/lgite-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
