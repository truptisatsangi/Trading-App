import "../styles/globals.css";
import Link from "next/link";

export default function App({ Component, pageProps }) {
  return (
    <>
      <header className="top-nav">
        <div className="top-nav-inner">
          <Link href="/tokens">Tokens</Link>
        </div>
      </header>
      <Component {...pageProps} />
    </>
  );
}
