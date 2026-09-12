import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { buildApiUrl } from "../../services/apiConfig";

type Inbound = {
	id?: string;
	contact_id?: string;
	from_phone?: string;
	phone?: string;
	body?: string;
	received_at?: string;
	created_at?: string;
};

type Outbound = {
	id?: string;
	contact_id?: string;
	body?: string;
	status?: string;
	created_at?: string;
	last_error?: string | null;
};

type Contact = {
	id: string;
	phone: string;
	name?: string;
	manual_takeover?: boolean;
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

export const SmsInboxPanel: React.FC = () => {
	const [inbound, setInbound] = useState<Inbound[]>([]);
	const [outbound, setOutbound] = useState<Outbound[]>([]);
	const [contacts, setContacts] = useState<Contact[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [selectedContactId, setSelectedContactId] = useState("");
	const [reply, setReply] = useState("");
	const [busy, setBusy] = useState(false);
	const [notice, setNotice] = useState("");

	const contactById = useMemo(() => {
		const map = new Map<string, Contact>();
		for (const c of contacts) map.set(c.id, c);
		return map;
	}, [contacts]);

	const load = useCallback(async () => {
		setLoading(true);
		setError("");
		try {
			const [inbox, contactRows] = await Promise.all([
				smsFetch("/sms/inbox"),
				smsFetch("/sms/contacts"),
			]);
			setInbound(Array.isArray(inbox.inbound) ? inbox.inbound : []);
			setOutbound(Array.isArray(inbox.outbound) ? inbox.outbound : []);
			setContacts(Array.isArray(contactRows) ? contactRows : []);
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed to load inbox");
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	const sendReply = async () => {
		if (!selectedContactId || !reply.trim()) return;
		setBusy(true);
		setError("");
		setNotice("");
		try {
			await smsFetch("/sms/send", {
				method: "POST",
				body: JSON.stringify({
					contactId: selectedContactId,
					text: reply.trim(),
					requestId: crypto.randomUUID(),
				}),
			});
			setReply("");
			setNotice("Message queued.");
			await load();
		} catch (e) {
			setError(e instanceof Error ? e.message : "Send failed");
		} finally {
			setBusy(false);
		}
	};

	if (loading) {
		return <p className="text-sm text-gray-500">Loading inbox…</p>;
	}

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<h2 className="text-lg font-semibold text-gray-900">Inbox</h2>
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
			{notice && (
				<p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
					{notice}
				</p>
			)}

			<div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
				<h3 className="text-sm font-semibold text-gray-900">Reply</h3>
				<select
					className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
					value={selectedContactId}
					onChange={(e) => setSelectedContactId(e.target.value)}
				>
					<option value="">Select contact…</option>
					{contacts.map((c) => (
						<option key={c.id} value={c.id}>
							{`${c.name || "Contact"} · ${c.phone}`}
							{c.manual_takeover ? " (manual)" : ""}
						</option>
					))}
				</select>
				<textarea
					className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
					rows={3}
					value={reply}
					onChange={(e) => setReply(e.target.value)}
					placeholder="Type a reply…"
				/>
				<button
					type="button"
					disabled={busy || !selectedContactId || !reply.trim()}
					onClick={() => void sendReply()}
					className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
				>
					{busy ? "Sending…" : "Send"}
				</button>
			</div>

			<div className="grid gap-4 lg:grid-cols-2">
				<section className="rounded-lg border border-gray-200 bg-white">
					<header className="border-b border-gray-100 px-4 py-3 text-sm font-semibold text-gray-900">
						Inbound
					</header>
					<ul className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
						{inbound.length === 0 && (
							<li className="px-4 py-6 text-sm text-gray-500">
								No inbound yet.
							</li>
						)}
						{inbound.map((row, idx) => {
							const contact = row.contact_id
								? contactById.get(row.contact_id)
								: undefined;
							return (
								<li key={row.id || idx} className="px-4 py-3 text-sm">
									<p className="font-medium text-gray-900">
										{contact?.name || row.from_phone || row.phone || "Unknown"}
									</p>
									<p className="text-gray-700 whitespace-pre-wrap">
										{row.body || "—"}
									</p>
									<p className="mt-1 text-xs text-gray-400">
										{row.received_at || row.created_at || ""}
									</p>
									{row.contact_id && (
										<button
											type="button"
											className="mt-1 text-xs text-indigo-600"
											onClick={() => setSelectedContactId(row.contact_id || "")}
										>
											Reply
										</button>
									)}
								</li>
							);
						})}
					</ul>
				</section>

				<section className="rounded-lg border border-gray-200 bg-white">
					<header className="border-b border-gray-100 px-4 py-3 text-sm font-semibold text-gray-900">
						Outbound
					</header>
					<ul className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
						{outbound.length === 0 && (
							<li className="px-4 py-6 text-sm text-gray-500">
								No outbound yet.
							</li>
						)}
						{outbound.map((row, idx) => (
							<li key={row.id || idx} className="px-4 py-3 text-sm">
								<p className="font-medium text-gray-900">
									{row.status || "queued"}
								</p>
								<p className="text-gray-700 whitespace-pre-wrap">
									{row.body || "—"}
								</p>
								{row.last_error && (
									<p className="text-xs text-red-600">{row.last_error}</p>
								)}
								<p className="mt-1 text-xs text-gray-400">
									{row.created_at || ""}
								</p>
							</li>
						))}
					</ul>
				</section>
			</div>
		</div>
	);
};
