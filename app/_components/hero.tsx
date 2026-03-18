import Link from "next/link";

export function Hero() {
  return (
    <section className="flex-1 flex flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
        Welcome to Your App
      </h1>
      <p className="text-lg text-muted-foreground max-w-md">
        Built with Next.js and Hatch
      </p>
      <Link
        href="https://nextjs.org/docs"
        className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
      >
        Get Started
      </Link>
    </section>
  );
}
