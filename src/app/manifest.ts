import type { MetadataRoute } from "next";

/** Lets Big SMS be installed as an app, with the Zicon mark as its icon. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Big SMS by Zicon",
    short_name: "Big SMS",
    description: "School management system by Zicon.",
    start_url: "/",
    display: "standalone",
    background_color: "#FBF6EE",
    theme_color: "#7A271D",
    icons: [
      { src: "/icon.png", sizes: "64x64", type: "image/png" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
