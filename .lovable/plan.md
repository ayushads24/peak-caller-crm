## Attempts/day field — plain number input

`src/components/workflow/create-flow-modal.tsx` ke Attempts/day input se up/down spinner arrows hatane hain.

### Change
Current:
```tsx
<Input type="number" min={1} max={5} value={c.attempts}
  onChange={(e) => update(i, { attempts: Math.max(1, Math.min(5, Number(e.target.value) || 1)) })}
  className="h-8" />
```

Naya:
```tsx
<Input
  type="text"
  inputMode="numeric"
  pattern="[0-9]*"
  value={c.attempts}
  onChange={(e) => {
    const digits = e.target.value.replace(/\D/g, "").slice(0, 1);
    const n = digits ? Math.max(1, Math.min(5, Number(digits))) : 1;
    update(i, { attempts: n });
  }}
  className="h-8 text-center"
/>
```

### Why
- `type="number"` ke karan browser default spinner (▲▼) dikhata hai — user ko seedha type karna mushkil lagta hai.
- `type="text"` + `inputMode="numeric"` mobile pe numeric keypad bhi dega, aur arrows nahi dikhayega.
- Clamping (1–5) wahi rahega, sirf digits accept honge.

### Scope
- Sirf ek file, ek input: `src/components/workflow/create-flow-modal.tsx`
- Koi business logic / save flow change nahi.
