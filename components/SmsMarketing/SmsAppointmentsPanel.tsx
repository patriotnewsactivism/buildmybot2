import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { buildApiUrl } from "../../services/apiConfig";

type Appointment = {
	id?: string;
	external_id?: string;
	phone?: string;
	name?: string;
	starts_at?: string;
	timezone?: string;
	status?: string;
	reminder_consent?: boolean;
};

async function smsFetch(path: string, init?: RequestInit) {
	const res = await fetch(buildApiUrl(path), {
		credentials: "include",
		headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
		...init,
	});
	const data = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
	return data;
}

function toIsoOffset(localValue: string): string {
	// datetime-local → ISO with offset approximated via Date
	const d = new Date(localValue);
	if (Number.isNaN(d.getTime())) throw new Error("Invalid start time");
	return d.toISOString();
}

export const SmsAppointmentsPanel: React.FC = () => {
	const [rows, setRows] = useState<Appointment[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [busy, setBusy] = useState(false);
	const [phone, setPhone] = useState("");
	const [name, setName] = useState("");
	const [startsLocal, setStartsLocal] = useState("");
	const [timezone, setTimezone] = useState("America/Chicago");
	const [consentSource, setConsentSource] = useState("dashboard_booking");
	const [reminderConsent, setReminderConsent] = useState(true);

	const load = useCallback(async () => {
		setLoading(true);
		setError("");
		try {
			const data = await smsFetch("/sms/appointments");
			setRows(Array.isArray(data) ? data : []);
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed to load appointments");
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	const createAppt = async () => {
		setBusy(true);
		setError("");
		try {
			await smsFetch("/sms/appointments", {
				method: "POST",
				body: JSON.stringify({
					externalId: `dash-${crypto.randomUUID()}`,
					version: 1,
					phone,
					name,
					startsAt: toIsoOffset(startsLocal),
					timezone,
					status: "scheduled",
					reminderConsent,
					consentSource,
					offsets: [1440, 120],
				}),
			});
			setPhone("");
			setName("");
			setStartsLocal("");
			await load();
		} catch (e) {
			setError(e instanceof Error ? e.message : "Could not create appointment");
		} finally {
			setBusy(false);
		}
	};

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<h2 className="text-lg font-semibold text-gray-900">Appointments</h2>
				<button
					type="button"
					onClick={() => void load()}
					className="text-sm text-indigo-600"
				>
					Refresh
				</button>
			</div>

			{error && (
				<p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
					{error}
				</p>
			)}

			<div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
				<h3 className="text-sm font-semibold text-gray-900">
					Schedule reminder
				</h3>
				<div className="grid gap-3 sm:grid-cols-2">
					<input
						className="rounded-md border border-gray-300 px-3 py-2 text-sm"
						placeholder="Phone"
						value={phone}
						onChange={(e) => setPhone(e.target.value)}
					/>
					<input
						className="rounded-md border border-gray-300 px-3 py-2 text-sm"
						placeholder="Name"
						value={name}
						onChange={(e) => setName(e.target.value)}
					/>
					<label className="block text-sm sm:col-span-2">
						<span className="font-medium text-gray-700">Starts at</span>
						<input
							type="datetime-local"
							className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
							value={startsLocal}
							onChange={(e) => setStartsLocal(e.target.value)}
						/>
					</label>
					<input
						className="rounded-md border border-gray-300 px-3 py-2 text-sm"
						placeholder="Timezone"
						value={timezone}
						onChange={(e) => setTimezone(e.target.value)}
					/>
					<input
						className="rounded-md border border-gray-300 px-3 py-2 text-sm"
						placeholder="Consent source"
						value={consentSource}
						onChange={(e) => setConsentSource(e.target.value)}
					/>
				</div>
				<label className="flex items-center gap-2 text-sm">
					<input
						type="checkbox"
						checked={reminderConsent}
						onChange={(e) => setReminderConsent(e.target.checked)}
					/>
					Reminder consent recorded
				</label>
				<button
					type="button"
					disabled={
						busy || !phone.trim() || !startsLocal || !consentSource.trim()
					}
					onClick={() => void createAppt()}
					className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
				>
					{busy ? "Saving…" : "Create appointment"}
				</button>
			</div>

			{loading ? (
				<p className="text-sm text-gray-500">Loading…</p>
			) : (
				<ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
					{rows.length === 0 && (
						<li className="px-4 py-6 text-sm text-gray-500">
							No appointments yet.
						</li>
					)}
					{rows.map((row, idx) => (
						<li key={row.id || idx} className="px-4 py-3 text-sm">
							<p className="font-medium text-gray-900">
								{row.name || "Guest"} · {row.phone}
							</p>
							<p className="text-xs text-gray-500">
								{row.starts_at || "—"} · {row.timezone || ""} ·{" "}
								{row.status || "scheduled"}
								{row.reminder_consent ? " · consent yes" : ""}
							</p>
						</li>
					))}
				</ul>
			)}
		</div>
	);
};
