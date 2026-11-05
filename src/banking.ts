export const bankOptions = ['CRDB Bank','NMB Bank','NBC Bank','Absa Bank Tanzania','Stanbic Bank Tanzania','Standard Chartered Tanzania','Exim Bank Tanzania','Equity Bank Tanzania','KCB Bank Tanzania','DTB Tanzania','I&M Bank Tanzania','Azania Bank','Bank of Africa Tanzania','DCB Commercial Bank','TCB Bank'];

// Only reuse an exact, unambiguous match supplied within this business.
// Account length and prefixes are not proof of the receiving bank.
export function detectSavedBank(account:string, employees: {account_number?:string;bank_name?:string}[]):string {
 if(!account || !/^[0-9]{4,34}$/.test(account))return '';
 const banks=new Set(employees.filter(e=>e.account_number===account&&e.bank_name).map(e=>e.bank_name!));
 return banks.size===1?[...banks][0]:'';
}
