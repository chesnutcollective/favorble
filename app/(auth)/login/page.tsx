"use client";

import { useState } from "react";
import Image from "next/image";
import { login } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
	const [error, setError] = useState<string | null>(null);
	const [isPending, setIsPending] = useState(false);
	const [email, setEmail] = useState("admin@hogansmith.com");
	const [password, setPassword] = useState("demo123!");

	async function handleSubmit(formData: FormData) {
		setError(null);
		setIsPending(true);
		const result = await login(formData);
		if (result?.error) {
			setError(result.error);
			setIsPending(false);
		}
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

					<form action={handleSubmit} className="space-y-4">
						{error && (
							<div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
								{error}
							</div>
						)}
						<div className="space-y-2">
							<Label htmlFor="email">Email</Label>
							<Input
								id="email"
								name="email"
								type="email"
								placeholder="you@example.com"
								value={email}
								onChange={(e) => setEmail(e.target.value)}
								required
								autoComplete="email"
								autoFocus
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="password">Password</Label>
							<Input
								id="password"
								name="password"
								type="password"
								placeholder="Your password"
								value={password}
								onChange={(e) => setPassword(e.target.value)}
								required
								autoComplete="current-password"
							/>
						</div>
						<Button type="submit" className="w-full" disabled={isPending}>
							{isPending ? "Signing in..." : "Sign in"}
						</Button>
					</form>

					<p className="text-center text-xs text-muted-foreground">
						Favorble &middot; by Hogan Smith
					</p>
				</div>
			</div>
		</div>
	);
}
