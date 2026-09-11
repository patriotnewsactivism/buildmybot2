import type React from "react";
import { useMemo, useState } from "react";
import {
	programSchema,
	type SmsProgram,
	SYSTEM_KEYWORDS,
	smsSegments,
} from "../../shared/sms";

const KINDS: SmsProgram["kind"][] = [
	"campaign",
	"keyword",
	"welcome",
	"after_hours",
	"sequence",
	"contest",
	"birthday",
];

const emptyFor = (kind: SmsProgram["kind"]): Partial<SmsProgram> => ({
	name: "",
	kind,
	status: "draft",
	text: "",
	keyword: undefined,
	steps: kind === "sequence" ? [{ delayMinutes: 60, text: "" }] : [],
	winnerCount: 1,
});

type Props = {
	initial?: Partial<SmsProgram> & { id?: string };
	onSubmit: (program: SmsProgram) => Promise<void>;
	onCancel: () => void;
	busy?: boolean;
};

export const SmsProgramForm: React.FC<Props> = ({
	initial,
	onSubmit,
	onCancel,
	busy,
}) => {
	const [form, setForm] = useState<Partial<SmsProgram>>(() => ({
		...emptyFor(initial?.kind || "campaign"),
		...initial,
	}));
	const [error, setError] = useState("");

	const segments = useMemo(() => smsSegments(form.text || ""), [form.text]);

	const set = <K extends keyof SmsProgram>(key: K, value: SmsProgram[K]) =>
		setForm((prev) => ({ ...prev, [key]: value }));

	const needsKeyword = ["keyword", "sequence", "contest", "birthday"].includes(
		form.kind || "",
	);

	const handleSave = async () => {
		setError("");
		const parsed = programSchema.safeParse(form);
		if (!parsed.success) {
			setError(parsed.error.issues.map((i) => i.message).join("; "));
			return;
		}
		if (parsed.data.keyword && SYSTEM_KEYWORDS.has(parsed.data.keyword)) {
			setError("This keyword is reserved");
			return;
		}
		try {
			await onSubmit(parsed.data);
		} catch (e) {
			setError(e instanceof Error ? e.message : "Save failed");
		}
	};

	return (
		<div className="space-y-4 rounded-lg border border-gray-200 bg-white p-5">
			<div className="grid gap-3 sm:grid-cols-2">
				<label className="block text-sm">
					<span className="font-medium text-gray-700">Name</span>
					<input
						className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
						value={form.name || ""}
						onChange={(e) => set("name", e.target.value)}
					/>
				</label>
				<label className="block text-sm">
					<span className="font-medium text-gray-700">Kind</span>
					<select
						className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
						value={form.kind}
						onChange={(e) => {
							const kind = e.target.value as SmsProgram["kind"];
							setForm(emptyFor(kind));
						}}
						disabled={Boolean(initial?.id)}
					>
						{KINDS.map((k) => (
							<option key={k} value={k}>
								{k}
							</option>
						))}
					</select>
				</label>
			</div>

			{needsKeyword && (
				<label className="block text-sm">
					<span className="font-medium text-gray-700">Keyword</span>
					<input
						className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm uppercase"
						value={form.keyword || ""}
						onChange={(e) =>
							set(
								"keyword",
								e.target.value.toUpperCase() as SmsProgram["keyword"],
							)
						}
						placeholder="JOIN"
					/>
				</label>
			)}

			<label className="block text-sm">
				<span className="font-medium text-gray-700">
					Message ({segments} segment{segments === 1 ? "" : "s"})
				</span>
				<textarea
					className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
					rows={4}
					value={form.text || ""}
					onChange={(e) => set("text", e.target.value)}
					placeholder="Hi {{name}} — thanks for joining!"
				/>
			</label>

			{form.kind === "sequence" && (
				<div className="space-y-2">
					<p className="text-sm font-medium text-gray-700">Steps</p>
					{(form.steps || []).map((step, idx) => (
						<div key={idx} className="grid gap-2 sm:grid-cols-[120px_1fr]">
							<input
								type="number"
								min={1}
								className="rounded-md border border-gray-300 px-3 py-2 text-sm"
								value={step.delayMinutes}
								onChange={(e) => {
									const steps = [...(form.steps || [])];
									steps[idx] = {
										...steps[idx],
										delayMinutes: Number(e.target.value),
									};
									set("steps", steps);
								}}
								placeholder="Delay min"
							/>
							<input
								className="rounded-md border border-gray-300 px-3 py-2 text-sm"
								value={step.text}
								onChange={(e) => {
									const steps = [...(form.steps || [])];
									steps[idx] = { ...steps[idx], text: e.target.value };
									set("steps", steps);
								}}
								placeholder="Step text"
							/>
						</div>
					))}
					<button
						type="button"
						className="text-sm font-medium text-indigo-600"
						onClick={() =>
							set("steps", [
								...(form.steps || []),
								{ delayMinutes: 1440, text: "" },
							])
						}
					>
						+ Add step
					</button>
				</div>
			)}

			{form.kind === "contest" && (
				<div className="grid gap-3 sm:grid-cols-2">
					{(
						[
							["prize", "Prize"],
							["rulesUrl", "Rules URL"],
							["entryUrl", "Entry URL"],
							["eligibility", "Eligibility"],
							["opensAt", "Opens at (ISO)"],
							["closesAt", "Closes at (ISO)"],
							["winnerText", "Winner text"],
							["confirmationText", "Confirmation text"],
						] as const
					).map(([key, label]) => (
						<label key={key} className="block text-sm sm:col-span-2">
							<span className="font-medium text-gray-700">{label}</span>
							<input
								className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
								value={(form[key] as string) || ""}
								onChange={(e) => set(key, e.target.value as never)}
							/>
						</label>
					))}
				</div>
			)}

			{error && (
				<p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
					{error}
				</p>
			)}

			<div className="flex justify-end gap-2">
				<button
					type="button"
					onClick={onCancel}
					className="rounded-md border border-gray-300 px-4 py-2 text-sm"
				>
					Cancel
				</button>
				<button
					type="button"
					disabled={busy}
					onClick={() => void handleSave()}
					className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
				>
					{busy ? "Saving…" : "Save draft"}
				</button>
			</div>
		</div>
	);
};
