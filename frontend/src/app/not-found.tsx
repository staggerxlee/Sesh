import Link from "next/link";
export default function NotFound() {
  return (
    <main className="not-found">
      <span className="eyebrow">A LITTLE OFF COURSE</span>
      <h1>Let’s find your focus.</h1>
      <p>This page isn’t here.</p>
      <Link href="/" className="button button-primary">
        Back to Sesh
      </Link>
    </main>
  );
}
