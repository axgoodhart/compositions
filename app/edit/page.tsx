import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Editor } from "./editor";

export const metadata: Metadata = { title: "Catalog editor" };

export default function EditPage() {
  if (process.env.NODE_ENV !== "development") notFound(); // never part of the deployed site
  return <Editor />;
}
