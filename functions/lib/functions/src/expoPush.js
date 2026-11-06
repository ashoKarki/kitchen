import { getFirestore } from "firebase-admin/firestore";
import { z } from "zod";
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";
const detailSchema = z.object({ error: z.string().optional() }).optional();
const ticketSchema = z.object({
    status: z.enum(["ok", "error"]),
    id: z.string().optional(),
    details: detailSchema,
    message: z.string().optional()
});
const receiptSchema = z.object({
    status: z.enum(["ok", "error"]),
    details: detailSchema,
    message: z.string().optional()
});
const ticketResponseSchema = z.object({ data: z.array(ticketSchema) });
const receiptResponseSchema = z.object({ data: z.record(receiptSchema) });
async function postJson(url, body) {
    const response = await fetch(url, {
        method: "POST",
        headers: {
            Accept: "application/json",
            "Accept-Encoding": "gzip, deflate",
            "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
    });
    if (!response.ok) {
        throw new Error(`Expo push request failed (${response.status}): ${await response.text()}`);
    }
    return response.json();
}
async function removeUnregisteredTokens(tokens) {
    await Promise.all(tokens.map(async (token) => {
        await getFirestore().doc(`kitchen/main/devices/${token}`).delete();
    }));
}
export async function sendExpoPush(tokens, title, body, screen = "shopping") {
    for (let offset = 0; offset < tokens.length; offset += 100) {
        const batch = tokens.slice(offset, offset + 100);
        const messages = batch.map((token) => ({
            to: token,
            title,
            body,
            data: { screen },
            sound: "default"
        }));
        const response = ticketResponseSchema.parse(await postJson(EXPO_PUSH_URL, messages));
        if (response.data.length !== batch.length) {
            throw new Error(`Expo returned ${response.data.length} tickets for ${batch.length} messages.`);
        }
        const invalidTokens = [];
        const receiptIds = [];
        response.data.forEach((ticket, index) => {
            const token = batch[index];
            if (token && ticket.status === "error" && ticket.details?.error === "DeviceNotRegistered") {
                invalidTokens.push(token);
            }
            if (token && ticket.status === "ok" && ticket.id)
                receiptIds.push({ id: ticket.id, token });
            if (ticket.status === "error" && ticket.details?.error !== "DeviceNotRegistered") {
                console.error("Expo push ticket error", { token, message: ticket.message, details: ticket.details });
            }
        });
        if (invalidTokens.length > 0)
            await removeUnregisteredTokens(invalidTokens);
        if (receiptIds.length > 0) {
            await new Promise((resolve) => setTimeout(resolve, 15000));
            const receiptResponse = receiptResponseSchema.parse(await postJson(EXPO_RECEIPTS_URL, { ids: receiptIds.map(({ id }) => id) }));
            const invalidReceiptTokens = [];
            receiptIds.forEach(({ id: receiptId, token }) => {
                const receipt = receiptResponse.data[receiptId];
                if (token
                    && receipt?.status === "error"
                    && receipt.details?.error === "DeviceNotRegistered")
                    invalidReceiptTokens.push(token);
                if (receipt?.status === "error" && receipt.details?.error !== "DeviceNotRegistered") {
                    console.error("Expo push receipt error", { receiptId, message: receipt.message, details: receipt.details });
                }
            });
            if (invalidReceiptTokens.length > 0)
                await removeUnregisteredTokens(invalidReceiptTokens);
        }
    }
}
