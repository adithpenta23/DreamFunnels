import { ArrowRightIcon } from "lucide-react"
import Link from "next/link"
import { buttonVariants } from "@/components/ui/button"
import { routes } from "@/config/routes"
import { siteConfig } from "@/config/site"

// Placeholder landing page. Marketing content is out of scope until launch.
export default function LandingPage() {
  return (
    <section className="mx-auto flex max-w-3xl flex-col items-center gap-6 px-4 py-24 text-center md:py-32">
      <p className="rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground">
        Early access
      </p>
      <h1 className="text-4xl font-semibold tracking-tight text-balance md:text-5xl">
        Launch high-converting funnels in minutes, not weeks.
      </h1>
      <p className="max-w-xl text-lg text-balance text-muted-foreground">
        {siteConfig.name} is the AI-native funnel and website builder for founders and marketers who
        want to ship, test and grow — with AI doing the heavy lifting.
      </p>
      <Link href={routes.signup} className={buttonVariants({ size: "lg" })}>
        Start building free
        <ArrowRightIcon aria-hidden />
      </Link>
    </section>
  )
}
