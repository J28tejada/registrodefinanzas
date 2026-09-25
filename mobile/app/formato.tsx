import { ScrollView, View } from 'react-native';
import Texto from '../componentes/Texto';
import { makeFormatters } from '@compartido/format';
import { CASOS, CONFIG_DE_PRUEBA, comprobarFormato } from '@compartido/formato-esperado';

/**
 * La tabla de oro del formato, dibujada para mirarla en un teléfono de verdad.
 *
 * Es la única forma de contestar la pregunta que ninguna prueba de escritorio
 * puede: Hermes no trae sus propios datos de formato, se los pide al sistema
 * operativo. O sea que el resultado depende de la versión de Android o de iOS
 * del aparato, y dos personas con la misma app pueden ver montos distintos.
 *
 * Abrila en el teléfono. Si está todo en verde, el formato coincide con la web
 * en ESE aparato. Si algo sale en rojo, dice qué esperaba y qué obtuvo.
 */
export default function Formato() {
  const fmt = makeFormatters(CONFIG_DE_PRUEBA);
  const fallas = comprobarFormato(fmt);
  const fallo = new Map(fallas.map(f => [`${f.caso.que}|${f.caso.entrada}`, f.obtuvo]));

  return (
    <ScrollView className="flex-1 bg-fondo" contentContainerClassName="p-4 pb-32">
      <View className="max-w-2xl mx-auto w-full gap-4">
        <View>
          <Texto className="text-xl font-semibold text-tinta">Formato</Texto>
          <Texto className="text-tinta-2 text-sm">
            {fallas.length === 0
              ? `Los ${CASOS.length} casos coinciden con la web en este teléfono.`
              : `${fallas.length} de ${CASOS.length} no coinciden con la web.`}
          </Texto>
        </View>

        <View className={`rounded-2xl border p-4 ${fallas.length === 0
          ? 'bg-acento/10 border-acento/30'
          : 'bg-peligro/10 border-peligro/30'}`}>
          <Texto className={`text-sm font-medium ${fallas.length === 0 ? 'text-acento' : 'text-peligro'}`}>
            {fallas.length === 0 ? 'Todo igual que en la web' : 'Hay diferencias'}
          </Texto>
        </View>

        <View className="bg-panel border border-t-borde-luz border-linea rounded-2xl p-4 gap-3">
          {CASOS.map(caso => {
            const obtuvo = fallo.get(`${caso.que}|${caso.entrada}`);
            return (
              <View key={`${caso.que}-${caso.entrada}`} className="gap-0.5">
                <Texto className="text-2xs text-tinta-2">
                  {caso.que}({JSON.stringify(caso.entrada)}) — {caso.porque}
                </Texto>
                {obtuvo === undefined ? (
                  <Texto className="text-sm text-acento">{caso.esperado}</Texto>
                ) : (
                  <>
                    <Texto className="text-sm text-peligro">obtuvo: {obtuvo}</Texto>
                    <Texto className="text-sm text-tinta-2">esperaba: {caso.esperado}</Texto>
                  </>
                )}
              </View>
            );
          })}
        </View>
      </View>
    </ScrollView>
  );
}
