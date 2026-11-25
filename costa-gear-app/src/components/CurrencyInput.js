import {amountFromEdit,amountFromPaste,displayAmount} from "../domain/currencyInput";
export default function CurrencyInput({value,onChange,required,min,placeholder="0.00",label="Amount CAD",...props}) {
  const positive=Number(min)>0;
  return <input {...props} data-currency-input="true" type="text" inputMode="numeric" autoComplete="off" aria-label={props["aria-label"]||label}
    value={displayAmount(value)} required={required} placeholder={placeholder}
    pattern={positive ? "(?:[0-9]*[1-9][0-9]*[.][0-9]{2}|0+[.](?:0[1-9]|[1-9][0-9]))" : "[0-9]+[.][0-9]{2}"}
    onChange={event=>onChange(amountFromEdit(event.target.value, String(event.nativeEvent?.inputType||"").startsWith("delete")))}
    onPaste={event=>{
      event.preventDefault();
      const amount=amountFromPaste(event.clipboardData.getData("text"));
      if(amount!==null){
        onChange(amount);
        event.currentTarget.dispatchEvent(new Event("cg:currency-edit",{bubbles:true}));
      }
    }}
  />;
}
