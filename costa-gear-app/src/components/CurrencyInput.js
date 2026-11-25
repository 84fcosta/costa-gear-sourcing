import {amountFromEdit,amountFromPaste,displayAmount} from "../domain/currencyInput";
export default function CurrencyInput({value,onChange,required,placeholder="0.00",label="Amount CAD",...props}) {
  return <input {...props} type="text" inputMode="numeric" autoComplete="off" aria-label={label}
    value={displayAmount(value)} required={required} placeholder={placeholder}
    onChange={event=>onChange(amountFromEdit(event.target.value, String(event.nativeEvent?.inputType||"").startsWith("delete")))}
    onPaste={event=>{
      event.preventDefault();
      const amount=amountFromPaste(event.clipboardData.getData("text"));
      if(amount!==null)onChange(amount);
    }}
  />;
}
