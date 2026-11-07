# Monisystem

A logo oficial é `../../logo-aps.png`, reutilizada sem alterações por `BrandLogo`.

`app-icon.png` é uma versão simplificada do símbolo central, criada com a ferramenta integrada image_gen a partir da logo oficial. Não substitui a logo completa. O ícone é referenciado por `app.json`; as variantes PNG em `android/app/src/main/res/mipmap-*` atendem ao projeto Android existente. Não houve instalação de dependências.

Prompt utilizado:

> Create a simplified square app icon for Monisystem from the supplied official logo. Only the central warning triangle and exclamation mark: minimal clean flat red #D9232E rounded triangle outline, graphite #202020 exclamation, small soft yellow #FFC400 attention rays on either side, white background. No text, no hazard tape, no texture, no gradients. Center all the mark inside the middle 60 percent of a square white canvas so it is safe for Android adaptive icon crop. Preserve recognizability of the supplied symbol. Save the resulting image as an app asset.

As cores da interface ficam em `src/components/theme.ts`. O vermelho fica reservado à marca e aos tokens críticos; o domínio atual não possui classificação de criticidade. Não inferir criticidade pela categoria ou pelo estado ativo de uma ocorrência.

Após alterar o ícone, é necessário recompilar e instalar o aplicativo Android. A atualização via Metro aplica os estilos e a logo interna, mas não substitui o ícone instalado.
