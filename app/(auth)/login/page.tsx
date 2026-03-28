"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
	const router = useRouter();
	const [isPending, setIsPending] = useState(false);

	function handleSignIn() {
		setIsPending(true);
		router.push("/dashboard");
	}

	return (
		<div className="flex min-h-svh bg-background">
			{/* Left panel — brand */}
			<div className="hidden lg:flex lg:w-1/2 items-center justify-center bg-primary">
				<Image
					src="/hogansmith-logo.png"
					alt="Hogan Smith Law"
					width={320}
					height={228}
					priority
				/>
			</div>

			{/* Right panel — form */}
			<div className="flex w-full lg:w-1/2 items-center justify-center p-8">
				<div className="w-full max-w-sm space-y-8">
					<div className="text-center lg:text-left">
						<Image
							src="/hogansmith-logo.png"
							alt="Hogan Smith Law"
							width={180}
							height={128}
							className="mx-auto lg:mx-0 lg:hidden mb-6"
							priority
						/>
						<h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
						<p className="mt-1 text-sm text-muted-foreground">
							Enter your credentials to access Favorble
						</p>
					</div>

					<div className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="email">Email</Label>
							<Input
								id="email"
								type="email"
								defaultValue="admin@hogansmith.com"
								readOnly
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="password">Password</Label>
							<Input
								id="password"
								type="password"
								defaultValue="demo123!"
								readOnly
							/>
						</div>
						<Button
							type="button"
							className="w-full"
							disabled={isPending}
							onClick={handleSignIn}
						>
							{isPending ? "Signing in..." : "Sign in"}
						</Button>
					</div>

					<p className="text-center text-xs text-muted-foreground">
						Favorble &middot; by Hogan Smith
					</p>
				</div>
			</div>
		</div>
	);
}
