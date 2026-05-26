export function angkaKeTerbilang(n) {
  const bilangan = ['', 'Satu', 'Dua', 'Tiga', 'Empat', 'Lima', 'Enam', 'Tujuh', 'Delapan', 'Sembilan', 'Sepuluh', 'Sebelas'];
  let temp = '';
  if (n < 12) temp = ' ' + bilangan[n];
  else if (n < 20) temp = angkaKeTerbilang(n - 10) + ' Belas';
  else if (n < 100) temp = angkaKeTerbilang(Math.floor(n / 10)) + ' Puluh' + angkaKeTerbilang(n % 10);
  else if (n < 200) temp = ' Seratus' + angkaKeTerbilang(n - 100);
  else if (n < 1000) temp = angkaKeTerbilang(Math.floor(n / 100)) + ' Ratus' + angkaKeTerbilang(n % 100);
  else if (n < 2000) temp = ' Seribu' + angkaKeTerbilang(n - 1000);
  else if (n < 1000000) temp = angkaKeTerbilang(Math.floor(n / 1000)) + ' Ribu' + angkaKeTerbilang(n % 1000);
  else if (n < 1000000000) temp = angkaKeTerbilang(Math.floor(n / 1000000)) + ' Juta' + angkaKeTerbilang(n % 1000000);
  return temp;
}
