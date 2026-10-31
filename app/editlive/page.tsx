import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LiveEditor } from "./live";

export const metadata: Metadata = { title: "Live editor" };

export default function EditLivePage() {
  if (process.env.NODE_ENV !== "development") notFound(); // never part of the deployed site
  return <LiveEditor />;
}
