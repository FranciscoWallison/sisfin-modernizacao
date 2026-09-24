####  Proposta do Trabalho

<details><summary><b>Texto</b></summary>
<p>
 Este trabalho tem como objetivo desenvolver um Sistema de Gestão Administrativo / Financeiro, oferecendo serviços de otimização de atividades no setor financeiro, com as funcionalidades de contas a pagar e receber, gerenciamento de contas bancárias e fluxo de caixa. Além de oferecer informações que ajudam os setores estratégicos, dando apoio à tomada de decisão, oferecendo uma boa interação e acessibilidade dos serviços. Serão utilizados modelos como multi-tenancy, modelo na qual nasceu com a computação em nuvem, e PWA (Progressive Web Apps) dando uma melhor interação dos seus serviços.
</p></details>

#### Pequeno resumo
```
Este projeto teve como objetivo de criar um sistem financeiro utilizando PWA,
para o TCC do curso Sistema de informação.
Algumas tecnologias utilizadas: Laravel, Vue.js, jquery, heroku, firebase,
push notification, php, javascript ...
```

# Telas

## Dashboard
``` Na página principal, temos um pequeno resumo da situação financeira.```

<details><summary><b>Dashboard  IMG</b></summary>
<p>

![image4](https://user-images.githubusercontent.com/19413241/157049090-722c0033-fdb2-4d26-b532-bcd4d9b600ed.png)
 
</p></details>

``` Cadastro da conta bancária no sistema, para o levantamento do salto total do cliente. ```
<details><summary><b>Cadastro da conta bancária  IMG</b></summary>
<p>
 
![image7](https://user-images.githubusercontent.com/19413241/157230843-1787402e-3814-47f7-9ce9-397ade27267b.png)
 
</p></details>

``` Na funcionalidade, fluxo de caixa, há uma tabela que tem os seguintes dados: o saldo final, saldo do mês anterior, geração de caixa, recebimentos, outras receitas, receitas de vendas, pagamento e despesas financeiras. Pode-se baixar o relatório da tabela no formato .csv.  ```
<details><summary><b>Fluxo de caixa  IMG</b></summary>
<p>

![image6](https://user-images.githubusercontent.com/19413241/157492849-b3659e99-ee60-4105-8fbc-edc82280cc2d.png)
 
</p></details>

```Na funcionalidade extratos a receber, há uma tabela que tem os seguintes dados: valor, saldo, lançamento e data. No rodapé da página, há a soma do total recebido, total de pagamentos, número de lançamentos e total do período.```
<details><summary><b>Extratos a receber IMG</b></summary>
<p>

 ![image9](https://user-images.githubusercontent.com/19413241/159173964-a9bddc91-421b-4765-884d-b414a0264c64.png)
 
</p></details>

```Na funcionalidade de contas a receber há uma tabela que tem os seguintes dados: valor da conta, descrição e data do vencimento da conta. No rodapé da página, há a soma das contas pagas, a pagar, vencidas e o total.```
<details><summary><b>Contas a receber  IMG</b></summary>
<p>

![image8](https://user-images.githubusercontent.com/19413241/158430797-7e471e31-3e90-4a94-92ea-1fa8121a0469.png)

</p></details>

```Na funcionalidade de contas a pagar, há uma tabela que tem os seguintes dados: valor da conta, descrição e data do vencimento da conta. No rodapé da página, há a soma das contas pagas, a pagar, vencidas e o total de pagamentos feitos. ```
<details><summary><b>Contas a pagar IMG</b></summary>
<p>

![image10](https://user-images.githubusercontent.com/19413241/157668935-2e97f25d-c5ab-47bc-8ec9-700c955ef1a1.png)

 </p></details>
 
 ----------------------------------------------------------------------------------------------
## Oques é SaaS?
- Significa Software como serviço
- Ambiente Compartilhado.
- Customizações por Cliente
- Atentimento a vários clientes
- Utiliza arquitetura multe-tenancy.
- Ideal em cloud server

## O que é multi-tenancy?
- Tenancy Significada: Locação Arrendamento
- Em ti: Inquilino
- Vários Clientes Por Aplicação
- Aplicavel quando aplicação vira um produto
- Clientes Compartilham Estrutua
- Escopo do Multi-Tenancy: Usuário, Empresas, Etc.
- Isolar as Unformações Logicamente
- Falha de um cliente não pode afetar em outro

## Qual Modelo Utilizar?
- Não há Verdade do Universo
- Enternder o Contexto que Será Aplicado
- Entender as Customizações
- Númemos de Usuários
- Recursos a Serem Utilizados

#### MODELOS DE IMPLEMENTAÇÃO

## TIPO (Tudo isolado (container, hadware, banco de dados))
- Alto nivel de segurança
- Alto consumo de hardware
- Monitoramento Individual

## TIPO (Conatiner compartilhado, banco de dados diferente)
- Customização
- Consistencia dos dados
- Volume de consumo
- Muitos Usuarios por TENANT

## TIPO (Tudo compaartilhado (container, hadware, banco de dadoss))
- Muitos TENANTS envolvidos
- Baixa Customização 


## libs 
```
- hyn/multi-tenant (trabalhas com subdominhos)
- orchestral/tenanti (trabalhas com varias instancias de bancos )
```
## [Nested set model](https://en.wikipedia.org/wiki/Nested_set_model)

## Vuex  Single Source of Truth (SSOT). 
```
[Flux](https://facebook.github.io/flux/docs/in-depth-overview.html#content) 
```
## O que é a fonte única da verdade?
```
O Conceito (Analogia do Armazém):
Imagine estruturar todas as informações da aplicação concentrando-as em um único lugar, que chamaremos de "Armazém". Neste modelo, os componentes visuais não retêm dados próprios; eles funcionam apenas como referência.

A regra é clara: qualquer alteração de informação deve ser feita exclusivamente neste Armazém. Como o acesso é centralizado, se modificarmos algo no Armazém, todos os componentes que consomem esses dados receberão a resposta atualizada instantaneamente.

É como uma biblioteca central: todos os componentes precisam consultá-la para obter informações, pois os dados oficiais residem nela e somente nela. Componentes podem até manter estados locais para interações menores, mas os dados vitais do negócio são sempre capturados dessa fonte principal.

Analogia Técnica:
Este conceito é amplamente utilizado em bancos de dados relacionais. Por exemplo, ao criarmos uma tabela de pedidos, não duplicamos os dados do cliente em cada venda; apenas criamos um apontamento (chave estrangeira) para a tabela de clientes. Assim, mantemos o ID vinculado e, caso alguém atualize o cadastro do cliente na origem, todas as consultas de pedidos refletirão essa mudança automaticamente, garantindo a integridade dos dados.
```

 ## Push Notificantion
 ```
 http://vineeshnp.com/push-notification-on-progressive-web-apps-with-firebase-cloud-messaging/
 
 https://console.firebase.google.com/project/sisfin-2bb72/settings/cloudmessaging/
 ```

## Link para Projeto
https://intense-dawn-46739.herokuapp.com/app#!/login

 ## Login
  ```
 cliente5@user.com
 cliente15@user.com
 cliente16@user.com
  ```
## Senha 
  ```
 secret
 ```
